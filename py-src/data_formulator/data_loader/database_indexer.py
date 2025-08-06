import json
import sqlite3
import os
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class DatabaseIndexer:
    """
    Database Indexer - Veritabanı şemalarını ve metadata'larını indeksler ve saklar.
    Bu sistem büyük veritabanlarında performanslı text-to-SQL için gerekli metadata'ları yönetir.
    """
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.index_db_path = f"flask_session/db_index_{session_id}.db"
        self._init_index_database()
    
    def _get_connection(self):
        """Properly configured SQLite connection with timeout and WAL mode"""
        conn = sqlite3.connect(self.index_db_path, timeout=60.0)  # Increased timeout
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA synchronous=NORMAL')
        conn.execute('PRAGMA cache_size=10000')
        conn.execute('PRAGMA temp_store=memory')
        conn.execute('PRAGMA busy_timeout=60000')  # 60 second timeout
        conn.execute('PRAGMA wal_autocheckpoint=1000')
        return conn
    
    def _init_index_database(self):
        """Index veritabanını başlat"""
        os.makedirs("flask_session", exist_ok=True)
        
        conn = sqlite3.connect(self.index_db_path, timeout=30.0)
        cursor = conn.cursor()
        
        # Enable WAL mode for better concurrent access
        cursor.execute('PRAGMA journal_mode=WAL')
        cursor.execute('PRAGMA synchronous=NORMAL')
        cursor.execute('PRAGMA cache_size=10000')
        cursor.execute('PRAGMA temp_store=memory')
        
        # Indexed databases table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS indexed_databases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data_loader_type TEXT NOT NULL,
                connection_name TEXT NOT NULL,
                connection_params TEXT NOT NULL,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_tables INTEGER DEFAULT 0,
                total_schemas INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active'
            )
        ''')
        
        # Indexed schemas table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS indexed_schemas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                database_id INTEGER,
                schema_name TEXT NOT NULL,
                table_count INTEGER DEFAULT 0,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (database_id) REFERENCES indexed_databases (id)
            )
        ''')
        
        # Indexed tables table - Tablo metadata'larını saklar
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS indexed_tables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                database_id INTEGER,
                schema_id INTEGER,
                table_name TEXT NOT NULL,
                full_table_name TEXT NOT NULL,
                row_count INTEGER DEFAULT -1,
                column_count INTEGER DEFAULT 0,
                table_metadata TEXT,
                sample_data TEXT,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                business_description TEXT,
                keywords TEXT,
                FOREIGN KEY (database_id) REFERENCES indexed_databases (id),
                FOREIGN KEY (schema_id) REFERENCES indexed_schemas (id)
            )
        ''')
        
        # Indexed columns table - Kolon detayları
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS indexed_columns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_id INTEGER,
                column_name TEXT NOT NULL,
                data_type TEXT NOT NULL,
                is_nullable BOOLEAN DEFAULT TRUE,
                is_primary_key BOOLEAN DEFAULT FALSE,
                is_foreign_key BOOLEAN DEFAULT FALSE,
                sample_values TEXT,
                statistics TEXT,
                semantic_type TEXT,
                business_description TEXT,
                FOREIGN KEY (table_id) REFERENCES indexed_tables (id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def index_database(self, data_loader_type: str, connection_name: str, 
                      connection_params: Dict[str, Any], 
                      data_loader_instance, 
                      ai_client=None) -> Dict[str, Any]:
        """
        Bir veritabanını indeksle
        
        Args:
            data_loader_type: Data loader tipi (e.g., 'mssql')
            connection_name: Bağlantı ismi
            connection_params: Bağlantı parametreleri
            data_loader_instance: Data loader instance
            ai_client: AI client for enhanced descriptions
        
        Returns:
            Indexing sonuçları
        """
        conn = None
        try:
            logger.info(f"Starting database indexing for {connection_name}")
            
            # Get all tables from the data loader
            tables = data_loader_instance.list_tables()
            
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Insert database record
            cursor.execute('''
                INSERT INTO indexed_databases 
                (data_loader_type, connection_name, connection_params, total_tables)
                VALUES (?, ?, ?, ?)
            ''', (data_loader_type, connection_name, json.dumps(connection_params), len(tables)))
            
            database_id = cursor.lastrowid
            
            # Group tables by schema
            schemas = {}
            for table in tables:
                schema_name = table['name'].split('.')[0] if '.' in table['name'] else 'default'
                if schema_name not in schemas:
                    schemas[schema_name] = []
                schemas[schema_name].append(table)
            
            # Index schemas
            schema_ids = {}
            for schema_name, schema_tables in schemas.items():
                cursor.execute('''
                    INSERT INTO indexed_schemas 
                    (database_id, schema_name, table_count)
                    VALUES (?, ?, ?)
                ''', (database_id, schema_name, len(schema_tables)))
                
                schema_ids[schema_name] = cursor.lastrowid
            
            # Index tables and columns
            indexed_tables_count = 0
            indexed_columns_count = 0
            
            for table in tables:
                schema_name = table['name'].split('.')[0] if '.' in table['name'] else 'default'
                table_name = table['name'].split('.')[-1]
                schema_id = schema_ids[schema_name]
                
                metadata = table.get('metadata', {})
                columns = metadata.get('columns', [])
                sample_rows = metadata.get('sample_rows', [])
                row_count = metadata.get('row_count', -1)
                
                # Generate business description with AI if available
                business_description = ""
                keywords = ""
                if ai_client:
                    try:
                        business_description, keywords = self._generate_table_description(
                            ai_client, table['name'], columns, sample_rows
                        )
                    except Exception as e:
                        logger.warning(f"Failed to generate AI description for {table['name']}: {e}")
                
                # Insert table
                cursor.execute('''
                    INSERT INTO indexed_tables 
                    (database_id, schema_id, table_name, full_table_name, row_count, 
                     column_count, table_metadata, sample_data, business_description, keywords)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    database_id, schema_id, table_name, table['name'], row_count,
                    len(columns), json.dumps(metadata), json.dumps(sample_rows),
                    business_description, keywords
                ))
                
                table_id = cursor.lastrowid
                indexed_tables_count += 1
                
                # Index columns
                for column in columns:
                    col_name = column.get('name', '')
                    col_type = column.get('type', '')
                    
                    # Extract sample values from sample_rows
                    sample_values = []
                    if sample_rows:
                        sample_values = list(set([
                            str(row.get(col_name, '')) for row in sample_rows[:10] 
                            if row.get(col_name) is not None
                        ]))[:10]
                    
                    # Generate semantic type and description with AI if available
                    semantic_type = ""
                    col_business_description = ""
                    if ai_client:
                        try:
                            semantic_type, col_business_description = self._generate_column_description(
                                ai_client, table['name'], col_name, col_type, sample_values
                            )
                        except Exception as e:
                            logger.warning(f"Failed to generate AI description for {table['name']}.{col_name}: {e}")
                    
                    cursor.execute('''
                        INSERT INTO indexed_columns 
                        (table_id, column_name, data_type, sample_values, 
                         semantic_type, business_description)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (
                        table_id, col_name, col_type, json.dumps(sample_values),
                        semantic_type, col_business_description
                    ))
                    
                    indexed_columns_count += 1
            
            # Update total counts
            cursor.execute('''
                UPDATE indexed_databases 
                SET total_tables = ?, total_schemas = ?
                WHERE id = ?
            ''', (indexed_tables_count, len(schemas), database_id))
            
            conn.commit()
            
            result = {
                'status': 'success',
                'database_id': database_id,
                'indexed_tables': indexed_tables_count,
                'indexed_columns': indexed_columns_count,
                'indexed_schemas': len(schemas),
                'connection_name': connection_name
            }
            
            logger.info(f"Database indexing completed: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Database indexing failed: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
        finally:
            if conn:
                conn.close()

    def index_database_with_progress(self, data_loader_type: str, connection_name: str, 
                                   connection_params: Dict[str, Any], 
                                   data_loader_instance, 
                                   ai_client=None,
                                   progress_callback=None,
                                   compact: bool = False) -> Dict[str, Any]:
        """Progress tracking ile veritabanı indeksleme"""
        conn = None
        try:
            if progress_callback:
                progress_callback(5, "Connecting to database...", 0, 0)
            
            # Get tables from data loader
            tables = data_loader_instance.list_tables()
            total_tables = len(tables)
            
            if progress_callback:
                progress_callback(10, f"Found {total_tables} tables", total_tables, 0)
            
            # Initialize database
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Insert database record
            cursor.execute('''
                INSERT INTO indexed_databases 
                (data_loader_type, connection_name, connection_params, total_tables, total_schemas, status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (data_loader_type, connection_name, json.dumps(connection_params), 0, 0, 'active'))
            
            database_id = cursor.lastrowid
            
            if progress_callback:
                progress_callback(15, "Processing schemas...", total_tables, 0)
            
            # Group tables by schema
            schemas = {}
            for table in tables:
                logger.info(f"Grouping table: {table.get('name', 'unknown')}")
                logger.info(f"Table keys: {list(table.keys())}")
                
                # Handle both metadata format and direct format
                if 'metadata' in table:
                    # Extract from metadata format (MSSQL format)
                    table_name = table['name']
                    # Handle schema.table format properly
                    if '.' in table_name:
                        schema_name, _ = table_name.split('.', 1)  # Split only on first dot
                    else:
                        schema_name = 'dbo'  # Default schema for SQL Server
                    
                    table['columns'] = table.get('metadata', {}).get('columns', [])
                    table['sample_rows'] = table.get('metadata', {}).get('sample_rows', [])
                    table['row_count'] = table.get('metadata', {}).get('row_count', 0)
                    logger.info(f"Metadata format: table_name={table_name}, schema_name={schema_name}")
                else:
                    # Direct format - use as is
                    schema_name = table.get('schema', 'dbo')  # Use 'dbo' as default for SQL Server
                    logger.info(f"Direct format: schema_name={schema_name}")
                
                logger.info(f"Final schema_name for table {table.get('name')}: {schema_name}")
                
                if schema_name not in schemas:
                    schemas[schema_name] = []
                schemas[schema_name].append(table)
            
            # Insert schemas
            schema_ids = {}
            for schema_name, schema_tables in schemas.items():
                cursor.execute('''
                    INSERT INTO indexed_schemas (database_id, schema_name, table_count)
                    VALUES (?, ?, ?)
                ''', (database_id, schema_name, len(schema_tables)))
                schema_ids[schema_name] = cursor.lastrowid
            
            indexed_tables_count = 0
            indexed_columns_count = 0
            
            if compact:
                logger.info(f"COMPACT INDEX MODE ENABLED: Only table/column names, types, and descriptions will be stored. No sample data, row counts, or sample values will be indexed.")
            
            # Process each table with progress
            for table_idx, table in enumerate(tables):
                # Use the same logic as schema grouping to determine schema_name
                if 'metadata' in table:
                    table_name = table['name']
                    # Handle schema.table format properly
                    if '.' in table_name:
                        schema_name, _ = table_name.split('.', 1)  # Split only on first dot
                    else:
                        schema_name = 'dbo'  # Default schema for SQL Server
                else:
                    schema_name = table.get('schema', 'dbo')  # Use 'dbo' as default for SQL Server
                
                logger.info(f"Processing table {table_idx}: {table.get('name', 'unknown')} -> schema: {schema_name}")
                logger.info(f"Available schema_ids: {list(schema_ids.keys())}")
                
                if schema_name not in schema_ids:
                    logger.error(f"Schema '{schema_name}' not found in schema_ids. Available: {list(schema_ids.keys())}")
                    raise KeyError(f"Schema '{schema_name}' not found")
                
                schema_id = schema_ids[schema_name]
                
                progress_percent = 15 + (table_idx / total_tables) * 80  # 15% to 95%
                
                if progress_callback:
                    logger.info(f"Calling progress_callback: {progress_percent:.1f}% for table {table['name']}")
                    progress_callback(
                        progress_percent, 
                        f"Processing table {table['name']} ({table_idx + 1}/{total_tables})",
                        total_tables,
                        table_idx + 1  # +1 because we're starting from 0
                    )
                
                # Insert table
                table_description = ""
                keywords = ""
                row_count = table.get('row_count', 0) if not compact else -1
                
                # Get table data safely
                table_columns = table.get('columns', [])
                table_sample_rows = [] if compact else table.get('sample_rows', [])
                
                # Generate table description with AI if available
                if ai_client and table_columns:
                    try:
                        table_description, keywords = self._generate_table_description(
                            ai_client, table['name'], table_columns, table_sample_rows
                        )
                    except Exception as e:
                        logger.warning(f"Failed to generate AI description for {table['name']}: {e}")
                
                # For compact mode, avoid storing heavy metadata/sample_data
                if compact:
                    cursor.execute('''
                        INSERT INTO indexed_tables 
                        (database_id, schema_id, table_name, full_table_name, business_description, keywords, 
                         row_count, column_count, table_metadata, sample_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        database_id, schema_id, table['name'].split('.')[-1], table['name'], table_description, 
                        keywords, row_count, len(table_columns), json.dumps({}),  # empty metadata
                        json.dumps([])  # empty sample data
                    ))
                else:
                    cursor.execute('''
                        INSERT INTO indexed_tables 
                        (database_id, schema_id, table_name, full_table_name, business_description, keywords, 
                         row_count, column_count, table_metadata, sample_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        database_id, schema_id, table['name'].split('.')[-1], table['name'], table_description, 
                        keywords, row_count, len(table_columns), json.dumps(table.get('metadata', {})), 
                        json.dumps(table_sample_rows)
                    ))
                
                table_id = cursor.lastrowid
                indexed_tables_count += 1
                
                # Process columns
                for col_idx, col in enumerate(table_columns):
                    col_name = col.get('name', '')
                    col_type = col.get('type', '')
                    
                    # Update progress for column processing
                    if progress_callback and len(table_columns) > 5:  # Only for tables with many columns
                        sub_progress = progress_percent + (col_idx / len(table_columns)) * (80 / total_tables)
                        progress_callback(
                            sub_progress,
                            f"Processing column {col_name} in {table['name']} ({col_idx + 1}/{len(table_columns)})",
                            total_tables,
                            table_idx + 1
                        )
                    
                    # Get sample values
                    sample_values = [] if compact else list(set([
                        str(row.get(col_name, '')) for row in table_sample_rows
                        if row.get(col_name) is not None and str(row.get(col_name)).strip()
                    ]))[:10]
                    
                    # Generate semantic type and description with AI if available
                    semantic_type = ""
                    col_business_description = ""
                    if ai_client:
                        try:
                            semantic_type, col_business_description = self._generate_column_description(
                                ai_client, table['name'], col_name, col_type, sample_values
                            )
                        except Exception as e:
                            logger.warning(f"Failed to generate AI description for {table['name']}.{col_name}: {e}")
                    
                    if compact:
                        cursor.execute('''
                            INSERT INTO indexed_columns 
                            (table_id, column_name, data_type, semantic_type, business_description)
                            VALUES (?, ?, ?, ?, ?)
                        ''', (
                            table_id, col_name, col_type,
                            semantic_type, col_business_description
                        ))
                    else:
                        cursor.execute('''
                            INSERT INTO indexed_columns 
                            (table_id, column_name, data_type, sample_values, 
                             semantic_type, business_description)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (
                            table_id, col_name, col_type, json.dumps(sample_values),
                            semantic_type, col_business_description
                        ))
                    
                    indexed_columns_count += 1
            
            # Update total counts
            cursor.execute('''
                UPDATE indexed_databases 
                SET total_tables = ?, total_schemas = ?
                WHERE id = ?
            ''', (indexed_tables_count, len(schemas), database_id))
            
            conn.commit()
            
            if progress_callback:
                progress_callback(100, "Database indexing completed!", total_tables, total_tables)
            
            result = {
                'status': 'success',
                'database_id': database_id,
                'indexed_tables': indexed_tables_count,
                'indexed_columns': indexed_columns_count,
                'indexed_schemas': len(schemas),
                'connection_name': connection_name
            }
            
            logger.info(f"Database indexing completed: {result}")
            return result
            
        except Exception as e:
            if progress_callback:
                progress_callback(0, f"Error: {str(e)}", 0, 0)
            logger.error(f"Database indexing failed: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _generate_table_description(self, ai_client, table_name: str, 
                                  columns: List[Dict], sample_rows: List[Dict]) -> tuple:
        """AI ile tablo açıklaması ve anahtar kelimeler üret"""
        
        columns_info = ", ".join([f"{col['name']} ({col['type']})" for col in columns[:10]])
        sample_info = json.dumps(sample_rows[:3], indent=2) if sample_rows else "No sample data"
        
        prompt = f"""
Analyze this database table and provide a business description and keywords:

Table: {table_name}
Columns: {columns_info}
Sample Data: {sample_info}

Please provide:
1. A concise business description (1-2 sentences) explaining what this table contains
2. Relevant keywords for searching (comma-separated)

Format your response as JSON:
{{
    "description": "Business description here",
    "keywords": "keyword1, keyword2, keyword3"
}}
"""
        
        messages = [
            {"role": "system", "content": "You are a database analyst. Analyze tables and provide business descriptions and search keywords."},
            {"role": "user", "content": prompt}
        ]
        
        response = ai_client.get_completion(messages=messages)
        content = response.choices[0].message.content
        
        try:
            result = json.loads(content)
            return result.get('description', ''), result.get('keywords', '')
        except:
            return content[:200], table_name.replace('_', ', ')
    
    def _generate_column_description(self, ai_client, table_name: str, column_name: str, 
                                   data_type: str, sample_values: List[str]) -> tuple:
        """AI ile kolon açıklaması ve semantic type üret"""
        
        sample_info = ", ".join(sample_values[:5]) if sample_values else "No sample data"
        
        prompt = f"""
Analyze this database column and provide semantic type and description:

Table: {table_name}
Column: {column_name}
Data Type: {data_type}
Sample Values: {sample_info}

Please provide:
1. Semantic type (e.g., customer_id, email, phone, date, amount, name, address, etc.)
2. Brief description of what this column represents

Format your response as JSON:
{{
    "semantic_type": "semantic_type_here",
    "description": "Column description here"
}}
"""
        
        messages = [
            {"role": "system", "content": "You are a database analyst. Analyze columns and provide semantic types and descriptions."},
            {"role": "user", "content": prompt}
        ]
        
        response = ai_client.get_completion(messages=messages)
        content = response.choices[0].message.content
        
        try:
            result = json.loads(content)
            return result.get('semantic_type', ''), result.get('description', '')
        except:
            return column_name, f"{column_name} column in {table_name}"
    
    def get_indexed_databases(self) -> List[Dict[str, Any]]:
        """İndekslenmiş veritabanlarını listele"""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id, data_loader_type, connection_name, total_tables, 
                       total_schemas, indexed_at, status
                FROM indexed_databases
                WHERE status = 'active'
                ORDER BY indexed_at DESC
            ''')
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'database_id': row[0],
                    'data_loader_type': row[1],
                    'connection_name': row[2],
                    'total_tables': row[3],
                    'total_schemas': row[4],
                    'indexed_at': row[5],
                    'status': row[6]
                })
            
            return results
        finally:
            if conn:
                conn.close()
    
    def get_database_schema(self, database_id: int) -> Dict[str, Any]:
        """Belirli bir veritabanının şemasını getir"""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Get database info
            cursor.execute('SELECT * FROM indexed_databases WHERE id = ?', (database_id,))
            db_row = cursor.fetchone()
            if not db_row:
                return {'error': 'Database not found'}
            
            # Get schemas
            cursor.execute('''
                SELECT s.id, s.schema_name, s.table_count,
                       GROUP_CONCAT(t.table_name) as tables
                FROM indexed_schemas s
                LEFT JOIN indexed_tables t ON s.id = t.schema_id
                WHERE s.database_id = ?
                GROUP BY s.id, s.schema_name, s.table_count
            ''', (database_id,))
            
            schemas = []
            for row in cursor.fetchall():
                tables = row[3].split(',') if row[3] else []
                schemas.append({
                    'schema_id': row[0],
                    'schema_name': row[1],
                    'table_count': row[2],
                    'tables': tables
                })
            
            return {
                'database_id': database_id,
                'connection_name': db_row[2],
                'data_loader_type': db_row[1],
                'total_tables': db_row[5],
                'total_schemas': db_row[6],
                'schemas': schemas
            }
        finally:
            if conn:
                conn.close()
    
    def search_tables(self, database_id: int, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Tablolarda arama yap"""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            search_query = f"%{query.lower()}%"
            
            cursor.execute('''
                SELECT t.id, t.full_table_name, t.business_description, t.keywords,
                       t.row_count, t.column_count, s.schema_name
                FROM indexed_tables t
                JOIN indexed_schemas s ON t.schema_id = s.id
                WHERE t.database_id = ? AND (
                    LOWER(t.table_name) LIKE ? OR 
                    LOWER(t.business_description) LIKE ? OR 
                    LOWER(t.keywords) LIKE ?
                )
                ORDER BY 
                    CASE 
                        WHEN LOWER(t.table_name) LIKE ? THEN 1
                        WHEN LOWER(t.keywords) LIKE ? THEN 2
                        ELSE 3
                    END,
                    t.row_count DESC
                LIMIT ?
            ''', (database_id, search_query, search_query, search_query, 
                  search_query, search_query, limit))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'table_id': row[0],
                    'table_name': row[1],
                    'description': row[2],
                    'keywords': row[3],
                    'row_count': row[4],
                    'column_count': row[5],
                    'schema_name': row[6]
                })
            
            return results
        finally:
            if conn:
                conn.close()
    
    def get_table_details(self, table_id: int) -> Dict[str, Any]:
        """Tablo detaylarını getir"""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Get table info
            cursor.execute('''
                SELECT t.*, s.schema_name, d.connection_name
                FROM indexed_tables t
                JOIN indexed_schemas s ON t.schema_id = s.id
                JOIN indexed_databases d ON t.database_id = d.id
                WHERE t.id = ?
            ''', (table_id,))
            
            table_row = cursor.fetchone()
            if not table_row:
                return {'error': 'Table not found'}
            
            # Get columns
            cursor.execute('''
                SELECT column_name, data_type, sample_values, semantic_type, business_description
                FROM indexed_columns
                WHERE table_id = ?
                ORDER BY column_name
            ''', (table_id,))
            
            columns = []
            for row in cursor.fetchall():
                sample_values = json.loads(row[2]) if row[2] else []
                columns.append({
                    'name': row[0],
                    'type': row[1],
                    'sample_values': sample_values,
                    'semantic_type': row[3],
                    'description': row[4]
                })
            
            return {
                'table_id': table_id,
                'table_name': table_row[4],
                'schema_name': table_row[-2],
                'connection_name': table_row[-1],
                'row_count': table_row[5],
                'description': table_row[8],
                'keywords': table_row[9],
                'columns': columns,
                'sample_data': json.loads(table_row[7]) if table_row[7] else []
            }
        finally:
            if conn:
                conn.close()
    
    def get_nlp_context(self, database_id: int, selected_tables: List[int] = None) -> Dict[str, Any]:
        """NLP-to-SQL için context bilgilerini getir"""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Get database info
            cursor.execute('SELECT connection_name, data_loader_type FROM indexed_databases WHERE id = ?', (database_id,))
            db_info = cursor.fetchone()
            
            if not db_info:
                return {'error': 'Database not found'}
            
            # Build table filter
            table_filter = ""
            params = [database_id]
            if selected_tables:
                placeholders = ','.join(['?' for _ in selected_tables])
                table_filter = f" AND t.id IN ({placeholders})"
                params.extend(selected_tables)
            
            # Get tables with detailed column information
            cursor.execute(f'''
                SELECT t.id, t.full_table_name, t.business_description, t.row_count
                FROM indexed_tables t
                WHERE t.database_id = ? {table_filter}
                ORDER BY t.row_count DESC
            ''', params)
            
            tables = []
            for row in cursor.fetchall():
                table_id, table_name, description, row_count = row
                
                # Get detailed columns for this table
                cursor.execute('''
                    SELECT column_name, data_type, sample_values, semantic_type, business_description
                    FROM indexed_columns
                    WHERE table_id = ?
                    ORDER BY column_name
                ''', (table_id,))
                
                columns = []
                for col_row in cursor.fetchall():
                    col_name, col_type, sample_values_json, semantic_type, col_description = col_row
                    sample_values = json.loads(sample_values_json) if sample_values_json else []
                    
                    columns.append({
                        'name': col_name,
                        'type': col_type,
                        'semantic_type': semantic_type or '',
                        'description': col_description or '',
                        'sample_values': sample_values[:5]  # Limit to 5 sample values
                    })
                
                tables.append({
                    'table_id': table_id,
                    'name': table_name,
                    'description': description or '',
                    'row_count': row_count or 0,
                    'columns': columns
                })
            
            return {
                'database_name': db_info[0],
                'data_loader_type': db_info[1],
                'tables': tables
            }
        finally:
            if conn:
                conn.close()
    
    def delete_database_index(self, database_id: int) -> bool:
        """Veritabanı indeksini sil"""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Mark as deleted instead of actually deleting
            cursor.execute('UPDATE indexed_databases SET status = ? WHERE id = ?', ('deleted', database_id))
            
            conn.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to delete database index: {e}")
            return False
        finally:
            if conn:
                conn.close()
    
    def get_database_connection_info(self, database_id: int) -> Dict[str, Any]:
        """Veritabanı bağlantı bilgilerini getir"""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT data_loader_type, connection_name, connection_params
                FROM indexed_databases 
                WHERE id = ? AND status != 'deleted'
            ''', (database_id,))
            
            row = cursor.fetchone()
            if not row:
                return None
            
            connection_params = json.loads(row[2]) if row[2] else {}
            
            return {
                'data_loader_type': row[0],
                'connection_name': row[1],
                'connection_params': connection_params
            }
        except Exception as e:
            logger.error(f"Failed to get database connection info: {e}")
            return None
        finally:
            if conn:
                conn.close()

    def get_compact_nlp_context(self, database_id: int, selected_tables: List[int] = None) -> Dict[str, Any]:
        """Küçük LLM modelleri için sadeleştirilmiş context döndürür.

        Yalnızca tablo ve kolon isimleri, veri tipleri ve açıklamaları içerir. Satır sayısı,
        örnek değerler vb. ağır alanlar dahil edilmez. Böylece çıktı token boyutu
        minimumda tutulur ve küçük modellerde halüsinasyon riski azalır.
        """
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Veritabanı bilgisi
            cursor.execute('SELECT connection_name, data_loader_type FROM indexed_databases WHERE id = ?', (database_id,))
            db_info = cursor.fetchone()
            if not db_info:
                return {'error': 'Database not found'}

            # Seçili tabloları filtrele
            table_filter = ""
            params = [database_id]
            if selected_tables:
                placeholders = ','.join(['?' for _ in selected_tables])
                table_filter = f" AND t.id IN ({placeholders})"
                params.extend(selected_tables)

            # Tabloları al
            cursor.execute(f'''
                SELECT t.id, t.full_table_name, t.business_description
                FROM indexed_tables t
                WHERE t.database_id = ? {table_filter}
                ORDER BY t.full_table_name
            ''', params)

            tables = []
            for row in cursor.fetchall():
                table_id, table_name, table_desc = row

                # Kolonları al (yalnızca isim, tip ve açıklama)
                cursor.execute('''
                    SELECT column_name, data_type, business_description
                    FROM indexed_columns
                    WHERE table_id = ?
                    ORDER BY column_name
                ''', (table_id,))

                columns = []
                for col_row in cursor.fetchall():
                    col_name, col_type, col_desc = col_row
                    columns.append({
                        'name': col_name,
                        'type': col_type,
                        'description': col_desc or ''
                    })

                tables.append({
                    'table_id': table_id,
                    'name': table_name,
                    'description': table_desc or '',
                    'columns': columns
                })

            return {
                'database_name': db_info[0],
                'data_loader_type': db_info[1],
                'tables': tables
            }
        finally:
            if conn:
                conn.close()