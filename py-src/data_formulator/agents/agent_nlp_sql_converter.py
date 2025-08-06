import json
import logging
from typing import Dict, Any, List, Optional
from data_formulator.agents.agent_utils import extract_json_objects, extract_code_from_gpt_response

logger = logging.getLogger(__name__)

ENHANCED_NLP_SQL_SYSTEM_PROMPT = '''You are a SQL assistant. Generate clean SQL queries using the provided table and column names.

**CRITICAL RULES:**
- Use ONLY the table names exactly as shown (e.g., if shown "DimCustomer", use "DimCustomer")
- Use ONLY the column names exactly as shown
- Do NOT add any schema prefixes like "dbo.", "sales.", etc.
- Write simple, standard SQL syntax
- When using GROUP BY, ensure ALL non-aggregate columns in SELECT are also in GROUP BY
- When selecting time periods, include the time columns (Year, Month, etc.) in both SELECT and GROUP BY

**Output Format:**
```sql
-- Your SQL query here
```

Generate only the SQL query in the code block above. No explanations needed.'''

class EnhancedNLPSQLConverter:
    """
    Enhanced NLP to SQL Converter - Büyük veritabanları için gelişmiş doğal dil SQL dönüştürücü
    """
    
    def __init__(self, client, database_indexer):
        self.client = client
        self.database_indexer = database_indexer
    
    def convert_query(self, database_id: int, natural_query: str, 
                     selected_tables: List[str] = None,
                     context_hints: Dict[str, Any] = None,
                     model: str = "gpt-4o-mini",
                     context_mode: str = "full") -> Dict[str, Any]:
        """
        Enhanced NLP to SQL query conversion with business context
        
        Returns:
            SQL sorgusu ve analiz sonuçları
        """
        try:
            # Get database context from indexer
            logger.info(f"Getting NLP context for database_id: {database_id}")
            if context_mode == "compact":
                db_context_raw = self.database_indexer.get_compact_nlp_context(database_id, selected_tables)
            else:
                db_context_raw = self.database_indexer.get_nlp_context(database_id, selected_tables)
            
            # COMPREHENSIVE DEBUG LOGGING
            logger.error(f"=== DEBUG: INDEXER RESPONSE ===")
            logger.error(f"Type: {type(db_context_raw)}")
            logger.error(f"Content preview: {str(db_context_raw)[:500]}")
            
            # Handle different return formats from indexer
            db_context = None
            
            if isinstance(db_context_raw, str):
                # If it's a string, try to parse it as JSON
                try:
                    import json
                    db_context = json.loads(db_context_raw)
                    logger.info("Parsed string response as JSON")
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse string response as JSON: {db_context_raw}")
                    return {'status': 'error', 'message': 'Invalid JSON response from indexer'}
            elif isinstance(db_context_raw, dict):
                db_context = db_context_raw
                logger.info("Received dict response from indexer")
            else:
                logger.error(f"Unexpected response type from indexer: {type(db_context_raw)}")
                return {'status': 'error', 'message': f'Unexpected response type: {type(db_context_raw)}'}
            
            # Additional debug logging for dict content
            if isinstance(db_context, dict):
                logger.error(f"Dict keys: {list(db_context.keys())}")
                for key, value in db_context.items():
                    logger.error(f"Key '{key}': type={type(value)}, preview={str(value)[:200]}")
            
            # Quick validation first
            if not db_context:
                logger.error("ERROR: Empty db_context")
                return {'status': 'error', 'message': 'No database context found'}
            
            if isinstance(db_context, dict) and 'error' in db_context:
                logger.error(f"ERROR: Context error: {db_context['error']}")
                return {'status': 'error', 'message': db_context['error']}
            
            # Type validation
            if not isinstance(db_context, dict):
                logger.error(f"ERROR: Expected dict, got {type(db_context)}")
                return {'status': 'error', 'message': f'Invalid context format: expected dict, got {type(db_context)}'}
            
            # Check for required keys
            if 'tables' not in db_context:
                logger.error(f"ERROR: No 'tables' key in context. Available keys: {list(db_context.keys())}")
                return {'status': 'error', 'message': 'No tables found in database context'}
            
            tables_data = db_context['tables']
            if not isinstance(tables_data, list):
                logger.error(f"ERROR: 'tables' is not a list. Type: {type(tables_data)}, Content: {tables_data}")
                return {'status': 'error', 'message': f'Invalid tables format: expected list, got {type(tables_data)}'}
            
            logger.info(f"SUCCESS: Valid context with {len(tables_data)} tables")
            
            # Now proceed with context building
            try:
                enhanced_context = self._build_enhanced_context(db_context, context_hints)
                logger.info("SUCCESS: Enhanced context built successfully")
            except Exception as context_error:
                logger.error(f"ERROR: Failed to build enhanced context: {context_error}")
                import traceback
                logger.error(f"Context build traceback: {traceback.format_exc()}")
                return {'status': 'error', 'message': f'Failed to build context: {str(context_error)}'}
            
            # Şemadan otomatik prompt oluştur
            schema_prompt = self._schema_to_prompt(enhanced_context)
            
            user_prompt = f"{schema_prompt}\n"
            user_prompt += f"Question: {natural_query}\n\n"
            user_prompt += "Generate SQL query using the tables above:"
            
            logger.info(f"Enhanced NLP-SQL Query: {natural_query}")
            logger.info(f"Available tables: {len(db_context['tables'])}")
            
            # Get AI response
            messages = [
                {"role": "system", "content": ENHANCED_NLP_SQL_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ]
            
            response = self.client.get_completion(messages=messages)
            
            # Parse the response
            return self._parse_response(response, natural_query, db_context)
            
        except Exception as e:
            logger.error(f"Enhanced NLP-SQL conversion failed: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def _build_enhanced_context(self, db_context: Dict[str, Any], 
                              context_hints: Dict[str, Any] = None) -> Dict[str, Any]:
        """Enhanced context bilgilerini oluştur"""
        
        try:
            # Basic validation
            if not isinstance(db_context, dict):
                raise TypeError(f"Expected dict, got {type(db_context)}")
                
            if 'tables' not in db_context:
                raise KeyError("'tables' key not found in db_context")
                
            tables_data = db_context['tables']
            if not isinstance(tables_data, list):
                raise TypeError(f"Expected list for 'tables', got {type(tables_data)}")
                
            enhanced_tables = []
            for table in tables_data:
                if not isinstance(table, dict):
                    continue
                    
                enhanced_table = {
                    'table_id': table.get('table_id'),
                    'name': table.get('name'),
                    'description': table.get('description', ''),
                    'row_count': table.get('row_count', 0),
                    'columns': []
                }
                
                if 'columns' in table and isinstance(table['columns'], list):
                    for col in table['columns']:
                        if isinstance(col, dict):
                            enhanced_table['columns'].append({
                                'name': col.get('name'),
                                'type': col.get('type'),
                                'description': col.get('description', ''),
                                'nullable': col.get('nullable', True),
                                'sample_values': col.get('sample_values', [])
                            })
                
                enhanced_tables.append(enhanced_table)
            
            result = {
                'database_name': db_context.get('database_name'),
                'data_loader_type': db_context.get('data_loader_type'),
                'tables': enhanced_tables,
                'context_hints': context_hints or {}
            }
            
            logger.info(f"Built enhanced context with {len(result['tables'])} tables")
            return result
            
        except Exception as e:
            logger.error(f"Error building enhanced context: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise e
    
    def _schema_to_prompt(self, context: dict) -> str:
        """
        Veritabanı şemasını minimal bilgiyle prompt stringine çevirir (halüsinasyon riskini azaltmak için).
        AI'ye sadece tablo isimlerini gösterir, schema prefix'lerini gizler.
        """
        prompt = "Available tables and columns:\n\n"
        
        for table in context.get("tables", []):
            full_table_name = table['name']
            
            # Schema prefix'ini çıkar (dbo.TableName -> TableName)
            if '.' in full_table_name:
                table_name = full_table_name.split('.')[-1]  # Son kısmı al
            else:
                table_name = full_table_name
            
            prompt += f"Table: {table_name}\n"
            
            # Sadece temel kolon bilgileri
            columns = table.get("columns", [])[:10]  # Max 10 kolon göster
            for col in columns:
                col_name = col['name']
                col_type = col.get('type', '')
                prompt += f"  - {col_name} ({col_type})\n"
            
            if len(table.get("columns", [])) > 10:
                prompt += f"  ... and {len(table.get('columns', [])) - 10} more columns\n"
            prompt += "\n"
        
        return prompt
    
    def _parse_response(self, response, original_query: str, db_context: Dict[str, Any]) -> Dict[str, Any]:
        """AI response'u parse et - basitleştirilmiş versiyon"""
        
        try:
            content = response.choices[0].message.content
            
            # Sadece SQL'i çıkar
            sql_query = ""
            
            # SQL kod bloğu ara
            try:
                sql_blocks = extract_code_from_gpt_response(content, "sql")
                if sql_blocks:
                    sql_query = sql_blocks[0].strip()
                else:
                    # Kod bloğu yoksa tüm içeriği temizle
                    sql_query = content.strip()
                    
            except Exception as e:
                logger.warning(f"SQL extraction error: {e}")
                sql_query = content.strip()
            
            if not sql_query:
                return {
                    'status': 'error',
                    'message': 'No SQL query generated'
                }
            
            # Validate and fix SQL query
            validated_sql, validation_message = self._validate_and_fix_sql(sql_query)
            
            return {
                'status': 'success',
                'original_query': original_query,
                'sql_query': validated_sql,
                'explanation': 'SQL query generated successfully',
                'validation_message': validation_message,
                'database_context': {
                    'database_name': db_context.get('database_name', 'Unknown'),
                    'available_tables': [t['name'] for t in db_context.get('tables', [])]
                }
            }
            
        except Exception as e:
            logger.error(f"Response parsing failed: {e}")
            return {
                'status': 'error',
                'message': f'Failed to parse AI response: {str(e)}'
            }
    
    def _validate_and_fix_sql(self, sql_query: str) -> tuple[str, str]:
        """Validate and fix common SQL issues"""
        try:
            import re
            
            # Check for GROUP BY issues
            sql_upper = sql_query.upper()
            
            # Find SELECT and GROUP BY clauses
            select_match = re.search(r'SELECT\s+(.*?)\s+FROM', sql_query, re.IGNORECASE | re.DOTALL)
            group_by_match = re.search(r'GROUP\s+BY\s+(.*?)(?:\s+ORDER\s+BY|\s+HAVING|\s+LIMIT|$)', sql_query, re.IGNORECASE | re.DOTALL)
            
            if select_match and group_by_match:
                select_clause = select_match.group(1).strip()
                group_by_clause = group_by_match.group(1).strip()
                
                # Parse SELECT columns (excluding aggregate functions)
                select_columns = []
                for col in select_clause.split(','):
                    col = col.strip()
                    # Skip aggregate functions like SUM(), COUNT(), etc.
                    if not re.search(r'\b(SUM|COUNT|AVG|MIN|MAX|FIRST|LAST)\s*\(', col, re.IGNORECASE):
                        # Extract column name (handle aliases and table prefixes)
                        col_name = re.sub(r'\s+AS\s+\w+', '', col, flags=re.IGNORECASE).strip()
                        # Remove table prefixes like T1., T2., etc.
                        col_name = re.sub(r'^[a-zA-Z0-9_]+\.', '', col_name).strip()
                        if col_name and col_name != '*':
                            select_columns.append(col_name)
                
                # Parse GROUP BY columns
                group_by_columns = []
                for col in group_by_clause.split(','):
                    col = col.strip()
                    # Remove table prefixes
                    col_name = re.sub(r'^[a-zA-Z0-9_]+\.', '', col).strip()
                    if col_name:
                        group_by_columns.append(col_name)
                
                # Check if all non-aggregate SELECT columns are in GROUP BY
                missing_columns = []
                for sel_col in select_columns:
                    if not any(sel_col.lower() == grp_col.lower() for grp_col in group_by_columns):
                        missing_columns.append(sel_col)
                
                if missing_columns:
                    logger.warning(f"SQL validation: SELECT columns not in GROUP BY: {missing_columns}")
                    
                    # Fix 1: Try to remove problematic SELECT columns and keep aggregates
                    if 'SUM(' in sql_upper or 'COUNT(' in sql_upper or 'AVG(' in sql_upper:
                        # Keep only aggregate columns and GROUP BY columns in SELECT
                        new_select_parts = []
                        for col in select_clause.split(','):
                            col = col.strip()
                            # Keep if it's an aggregate function
                            if re.search(r'\b(SUM|COUNT|AVG|MIN|MAX|FIRST|LAST)\s*\(', col, re.IGNORECASE):
                                new_select_parts.append(col)
                            # Keep if it's in GROUP BY
                            else:
                                col_name = re.sub(r'\s+AS\s+\w+', '', col, flags=re.IGNORECASE).strip()
                                col_name = re.sub(r'^[a-zA-Z0-9_]+\.', '', col_name).strip()
                                if any(col_name.lower() == grp_col.lower() for grp_col in group_by_columns):
                                    new_select_parts.append(col)
                        
                        if new_select_parts:
                            new_select_clause = ', '.join(new_select_parts)
                            fixed_sql = re.sub(
                                r'SELECT\s+(.*?)\s+FROM',
                                f'SELECT {new_select_clause} FROM',
                                sql_query,
                                flags=re.IGNORECASE | re.DOTALL
                            )
                            return fixed_sql, f"Fixed GROUP BY issue: Removed non-grouped columns from SELECT"
                    
                    # Fix 2: Add missing columns to GROUP BY if they're simple columns
                    simple_missing = [col for col in missing_columns if not re.search(r'[()\\+\\-\\*\\/]', col)]
                    if simple_missing:
                        # Add table prefixes back to GROUP BY if needed
                        additional_group_cols = []
                        for col in simple_missing:
                            # Try to find the table prefix from the original SELECT
                            for orig_col in select_clause.split(','):
                                orig_col = orig_col.strip()
                                if col.lower() in orig_col.lower() and '.' in orig_col:
                                    table_prefix = orig_col.split('.')[0].strip()
                                    additional_group_cols.append(f"{table_prefix}.{col}")
                                    break
                            else:
                                additional_group_cols.append(col)
                        
                        if additional_group_cols:
                            new_group_by = group_by_clause + ', ' + ', '.join(additional_group_cols)
                            fixed_sql = re.sub(
                                r'GROUP\s+BY\s+(.*?)(?=\s+ORDER\s+BY|\s+HAVING|\s+LIMIT|$)',
                                f'GROUP BY {new_group_by}',
                                sql_query,
                                flags=re.IGNORECASE | re.DOTALL
                            )
                            return fixed_sql, f"Fixed GROUP BY issue: Added missing columns to GROUP BY"
            
            return sql_query, "SQL validation passed"
            
        except Exception as e:
            logger.warning(f"SQL validation error: {e}")
            return sql_query, f"SQL validation error: {e}"
    
    def suggest_improvements(self, database_id: int, sql_query: str) -> Dict[str, Any]:
        """SQL sorgusunu iyileştirme önerileri ver"""
        
        try:
            db_context = self.database_indexer.get_nlp_context(database_id)
            
            improvement_prompt = f"""
Analyze this SQL query and suggest improvements:

Database Context:
{json.dumps(db_context, indent=2)}

SQL Query:
{sql_query}

Please provide:
1. Performance optimization suggestions
2. Code readability improvements
3. Potential issues or risks
4. Alternative approaches

Format as JSON:
{{
    "performance_suggestions": ["suggestion1", "suggestion2"],
    "readability_improvements": ["improvement1", "improvement2"],
    "potential_issues": ["issue1", "issue2"],
    "alternative_approaches": ["approach1", "approach2"],
    "overall_assessment": "assessment"
}}
"""
            
            messages = [
                {"role": "system", "content": "You are an expert SQL performance analyst and code reviewer."},
                {"role": "user", "content": improvement_prompt}
            ]
            
            response = self.client.get_completion(messages=messages)
            content = response.choices[0].message.content
            
            # Try to parse JSON response
            try:
                suggestions = json.loads(content)
                return {
                    'status': 'success',
                    'suggestions': suggestions
                }
            except:
                return {
                    'status': 'success',
                    'suggestions': {'raw_response': content}
                }
                
        except Exception as e:
            logger.error(f"Failed to generate improvement suggestions: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def explain_query(self, sql_query: str, database_id: int = None) -> str:
        """SQL sorgusunu açıkla"""
        
        try:
            context_info = ""
            if database_id:
                db_context = self.database_indexer.get_nlp_context(database_id)
                context_info = f"Database Context:\n{json.dumps(db_context, indent=2)}\n\n"
            
            explanation_prompt = f"""
{context_info}Explain this SQL query in simple, non-technical language:

{sql_query}

Please explain:
1. What data this query retrieves
2. How it processes the data
3. What the results will look like
4. Any important considerations

Keep the explanation clear and accessible to non-technical users.
"""
            
            messages = [
                {"role": "system", "content": "You are a helpful database teacher who explains SQL queries in simple terms."},
                {"role": "user", "content": explanation_prompt}
            ]
            
            response = self.client.get_completion(messages=messages)
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Failed to explain query: {e}")
            return f"Sorry, I couldn't explain this query: {e}" 