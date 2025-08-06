import json
import logging
import os
from flask import Blueprint, request, jsonify, session
from data_formulator.data_loader.database_indexer import DatabaseIndexer
from data_formulator.agents.agent_nlp_sql_converter import EnhancedNLPSQLConverter
from data_formulator.agent_routes import get_client
from data_formulator.data_loader.mssql_data_loader import MSSQLDataLoader
from data_formulator.data_loader.mysql_data_loader import MySQLDataLoader
from data_formulator.data_loader.kusto_data_loader import KustoDataLoader
from typing import Union, Dict

def get_data_loader_class(data_loader_type: str):
    """Data loader tipine göre uygun class'ı döndür"""
    loaders = {
        'mssql': MSSQLDataLoader,
        'mysql': MySQLDataLoader,
        'kusto': KustoDataLoader
    }
    return loaders.get(data_loader_type)

logger = logging.getLogger(__name__)

indexing_bp = Blueprint('indexing', __name__)

# -------------------------------------------------------------
# Helper util to normalise model parameter coming from frontend
# It accepts either a plain string (model name) or the already
# prepared dict coming from the /check-available-models endpoint
# and returns the complete dict that `get_client` expects.
# -------------------------------------------------------------

def _normalize_model_config(model: Union[str, Dict[str, str]]) -> Dict[str, str]:
    """Return a valid model_config dict regardless of the input type.

    Front-end sometimes sends the raw model name (e.g. "gemma3:4b") and other
    times sends the full config dict produced by `/api/agent/check-available-models`.
    This helper ensures we always end up with the full dict expected by
    `get_client`.
    """

    if isinstance(model, dict):
        return model
    elif isinstance(model, str):
        if model.startswith("gemma") or model.startswith("llama"):
            return {
                "endpoint": "ollama",
                "model": model,
                "api_key": "",
                "api_base": "http://localhost:11434",
                "api_version": ""
            }
        return {
            "endpoint": "openai",
            "model": model,
            "api_key": os.getenv("OPENAI_API_KEY", ""),
            "api_base": os.getenv("OPENAI_API_BASE", ""),
            "api_version": os.getenv("OPENAI_API_VERSION", "")
        }
    else:
        raise ValueError("Invalid model parameter type")

@indexing_bp.route('/index-database', methods=['POST'])
def index_database():
    """Veritabanını indeksle"""
    try:
        if not request.is_json:
            return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
        
        content = request.get_json()
        
        # Required parameters
        data_loader_type = content.get('data_loader_type')
        connection_name = content.get('connection_name')
        connection_params = content.get('connection_params', {})
        use_ai_descriptions = content.get('use_ai_descriptions', False)
        compact_index = content.get('compact', False)
        model = content.get('model', 'gpt-3.5-turbo')
        
        if not data_loader_type or not connection_name:
            return jsonify({
                'status': 'error', 
                'message': 'data_loader_type and connection_name are required'
            }), 400
        
        # Initialize database indexer - use 'default' for persistent indexing
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        
        # Get data loader class and create instance
        data_loader_class = get_data_loader_class(data_loader_type)
        if not data_loader_class:
            return jsonify({
                'status': 'error',
                'message': f'Unsupported data loader type: {data_loader_type}'
            }), 400
        
        # Create data loader instance
        # Note: We need a dummy DuckDB connection for the data loader
        import duckdb
        dummy_conn = duckdb.connect(':memory:')
        data_loader_instance = data_loader_class(connection_params, dummy_conn)
        
        # Get AI client if descriptions are requested
        ai_client = None
        if use_ai_descriptions:
            try:
                ai_client = get_client(_normalize_model_config(model))
            except Exception as e:
                logger.warning(f"Failed to initialize AI client: {e}")
        
        # Progress tracking için session'a kaydet
        progress_key = f"indexing_progress_{session_id}"
        session[progress_key] = {
            'status': 'starting',
            'progress': 0,
            'message': 'Initializing database indexing...',
            'total_tables': 0,
            'processed_tables': 0
        }
        
        # Perform indexing with progress tracking
        result = indexer.index_database_with_progress(
            data_loader_type=data_loader_type,
            connection_name=connection_name,
            connection_params=connection_params,
            data_loader_instance=data_loader_instance,
            ai_client=ai_client,
            progress_callback=lambda progress, message, total, processed: update_progress(
                progress_key, progress, message, total, processed
            ),
            compact=compact_index
        )
        
        # Final progress update
        session[progress_key] = {
            'status': 'completed',
            'progress': 100,
            'message': 'Database indexing completed successfully!',
            'total_tables': result.get('indexed_tables', 0),
            'processed_tables': result.get('indexed_tables', 0)
        }
        
        dummy_conn.close()
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Database indexing failed: {e}")
        
        # Error progress update
        progress_key = f"indexing_progress_{session.get('session_id', 'default')}"
        session[progress_key] = {
            'status': 'error',
            'progress': 0,
            'message': f'Error: {str(e)}',
            'total_tables': 0,
            'processed_tables': 0
        }
        
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

def update_progress(progress_key, progress, message, total_tables, processed_tables):
    """Progress callback function"""
    # Always update progress to ensure real-time feedback
    session[progress_key] = {
        'status': 'in_progress',
        'progress': round(progress, 1),  # Round to 1 decimal place
        'message': message,
        'total_tables': total_tables,
        'processed_tables': processed_tables
    }
    
    # Log progress for debugging
    logger.info(f"Progress update: {progress:.1f}% - {message} ({processed_tables}/{total_tables})")

@indexing_bp.route('/indexing-progress', methods=['GET'])
def get_indexing_progress():
    """İndeksleme ilerlemesini getir"""
    try:
        session_id = session.get('session_id', 'default')
        progress_key = f"indexing_progress_{session_id}"
        
        progress_data = session.get(progress_key, {
            'status': 'idle',
            'progress': 0,
            'message': 'No indexing in progress',
            'total_tables': 0,
            'processed_tables': 0
        })
        
        return jsonify({
            'status': 'success',
            'progress': progress_data
        })
        
    except Exception as e:
        logger.error(f"Failed to get indexing progress: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/list-indexed-databases', methods=['GET'])
def list_indexed_databases():
    """İndekslenmiş veritabanlarını listele"""
    try:
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        
        databases = indexer.get_indexed_databases()
        
        return jsonify({
            'status': 'success',
            'databases': databases
        })
        
    except Exception as e:
        logger.error(f"Failed to list indexed databases: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/get-database-schema/<int:database_id>', methods=['GET'])
def get_database_schema(database_id):
    """Veritabanı şemasını getir"""
    try:
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        
        schema = indexer.get_database_schema(database_id)
        
        if 'error' in schema:
            return jsonify({
                'status': 'error',
                'message': schema['error']
            }), 404
        
        return jsonify({
            'status': 'success',
            'schema': schema
        })
        
    except Exception as e:
        logger.error(f"Failed to get database schema: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/search-tables/<int:database_id>', methods=['POST'])
def search_tables(database_id):
    """Tablolarda arama yap"""
    try:
        if not request.is_json:
            return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
        
        content = request.get_json()
        query = content.get('query', '')
        limit = content.get('limit', 20)
        
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        
        results = indexer.search_tables(database_id, query, limit)
        
        return jsonify({
            'status': 'success',
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Table search failed: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/enhanced-nlp-to-sql', methods=['POST'])
def enhanced_nlp_to_sql():
    """Enhanced NLP to SQL conversion"""
    try:
        if not request.is_json:
            return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
        
        content = request.get_json()
        
        # Required parameters
        database_id = content.get('database_id')
        natural_query = content.get('natural_query')
        model = content.get('model', 'gpt-4')
        
        # Optional parameters
        selected_tables = content.get('selected_tables', [])
        context_hints = content.get('context_hints', {})
        context_mode = content.get('context_mode', 'full')
        
        if not database_id or not natural_query:
            return jsonify({
                'status': 'error',
                'message': 'database_id and natural_query are required'
            }), 400
        
        # Initialize components
        session_id = 'default'  # Use fixed session for database indexing
        
        try:
            indexer = DatabaseIndexer(session_id)
            logger.info("DatabaseIndexer initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize DatabaseIndexer: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise e
        
        # ---------- normalise & initialise LLM client ----------
        try:
            model_config = _normalize_model_config(model)
            ai_client = get_client(model_config)
            logger.info(f"AI client initialized successfully for model: {model_config['model']}")
        except Exception as e:
            logger.error(f"Failed to initialize AI client: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise e
        
        try:
            converter = EnhancedNLPSQLConverter(ai_client, indexer)
            logger.info("EnhancedNLPSQLConverter initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize EnhancedNLPSQLConverter: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise e
        
        try:
            # Convert natural language to SQL
            logger.info(f"Starting NLP-to-SQL conversion: db_id={database_id}, query='{natural_query}', model={model}")
            result = converter.convert_query(
                database_id=database_id,
                natural_query=natural_query,
                selected_tables=selected_tables if selected_tables else None,
                context_hints=context_hints if context_hints else None,
                model=model_config["model"],
                context_mode=context_mode
            )
            logger.info("NLP-to-SQL conversion completed successfully")
        except Exception as e:
            logger.error(f"Failed during convert_query: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise e
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Enhanced NLP-to-SQL conversion failed: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/explain-sql', methods=['POST'])
def explain_sql():
    """SQL sorgusunu açıkla"""
    try:
        if not request.is_json:
            return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
        
        content = request.get_json()
        
        sql_query = content.get('sql_query')
        database_id = content.get('database_id')
        model = content.get('model', 'gpt-3.5-turbo')
        
        if not sql_query:
            return jsonify({
                'status': 'error',
                'message': 'sql_query is required'
            }), 400
        
        # Initialize components
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        ai_client = get_client(_normalize_model_config(model))
        
        converter = EnhancedNLPSQLConverter(ai_client, indexer)
        
        # Explain the query
        explanation = converter.explain_query(sql_query, database_id)
        
        return jsonify({
            'status': 'success',
            'explanation': explanation
        })
        
    except Exception as e:
        logger.error(f"SQL explanation failed: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/suggest-sql-improvements', methods=['POST'])
def suggest_sql_improvements():
    """SQL iyileştirme önerileri"""
    try:
        if not request.is_json:
            return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
        
        content = request.get_json()
        
        sql_query = content.get('sql_query')
        database_id = content.get('database_id')
        model = content.get('model', 'gpt-4')
        
        if not sql_query or not database_id:
            return jsonify({
                'status': 'error',
                'message': 'sql_query and database_id are required'
            }), 400
        
        # Initialize components
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        ai_client = get_client(_normalize_model_config(model))
        
        converter = EnhancedNLPSQLConverter(ai_client, indexer)
        
        # Get improvement suggestions
        result = converter.suggest_improvements(database_id, sql_query)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"SQL improvement suggestions failed: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/delete-database-index/<int:database_id>', methods=['DELETE'])
def delete_database_index(database_id):
    """Veritabanı indeksini sil"""
    try:
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        
        success = indexer.delete_database_index(database_id)
        
        if success:
            return jsonify({
                'status': 'success',
                'message': 'Database index deleted successfully'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Failed to delete database index'
            }), 500
        
    except Exception as e:
        logger.error(f"Failed to delete database index: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/get-nlp-context/<int:database_id>', methods=['GET'])
def get_nlp_context(database_id):
    """NLP-to-SQL için context bilgilerini getir"""
    try:
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        
        # Get selected tables from query parameters
        selected_tables = request.args.get('selected_tables')
        if selected_tables:
            try:
                selected_tables = [int(x) for x in selected_tables.split(',')]
            except:
                selected_tables = None
        
        context = indexer.get_nlp_context(database_id, selected_tables)
        
        if 'error' in context:
            return jsonify({
                'status': 'error',
                'message': context['error']
            }), 404
        
        return jsonify({
            'status': 'success',
            'context': context
        })
        
    except Exception as e:
        logger.error(f"Failed to get NLP context: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/get-database-connection/<int:database_id>', methods=['GET'])
def get_database_connection(database_id):
    """Veritabanı bağlantı bilgilerini getir"""
    try:
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)
        
        connection_info = indexer.get_database_connection_info(database_id)
        
        if not connection_info:
            return jsonify({
                'status': 'error',
                'message': 'Database not found'
            }), 404
        
        return jsonify({
            'status': 'success',
            'connection_info': connection_info
        })
        
    except Exception as e:
        logger.error(f"Failed to get database connection info: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/get-compact-nlp-context/<int:database_id>', methods=['GET'])
def get_compact_nlp_context(database_id):
    """Küçük LLM modelleri için tablo/kolon odaklı sade context getirir"""
    try:
        session_id = 'default'  # Use fixed session for database indexing
        indexer = DatabaseIndexer(session_id)

        # Query string ile tablo filtreleme opsiyonunu koru
        selected_tables = request.args.get('selected_tables')
        if selected_tables:
            try:
                selected_tables = [int(x) for x in selected_tables.split(',')]
            except:
                selected_tables = None

        context = indexer.get_compact_nlp_context(database_id, selected_tables)

        if 'error' in context:
            return jsonify({
                'status': 'error',
                'message': context['error']
            }), 404

        return jsonify({
            'status': 'success',
            'context': context
        })

    except Exception as e:
        logger.error(f"Failed to get compact NLP context: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@indexing_bp.route('/translate-query', methods=['POST'])
def translate_query():
    """Translate Turkish text to English using LLM for data analysis queries"""
    try:
        if not request.is_json:
            return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
        
        content = request.get_json()
        
        # Required parameters
        query = content.get('query')
        model = content.get('model', 'gpt-4')
        original_text = content.get('original_text', '')
        
        if not query:
            return jsonify({
                'status': 'error',
                'message': 'query is required for translation'
            }), 400
        
        logger.info(f"Translation request: original='{original_text}', model={model}")
        
        # Initialize AI client
        try:
            model_config = _normalize_model_config(model)
            ai_client = get_client(model_config)
            logger.info(f"AI client initialized for translation with model: {model_config['model']}")
        except Exception as e:
            logger.error(f"Failed to initialize AI client for translation: {e}")
            return jsonify({
                'status': 'error',
                'message': f'Failed to initialize AI client: {str(e)}'
            }), 500
        
        try:
            # Get translation from LLM with a very strict prompt
            messages = [
                {"role": "user", "content": f"Turkish: {query}\nEnglish:"}
            ]
            
            response = ai_client.get_completion(messages=messages)
            full_response = response.choices[0].message.content.strip()
            
            # Extract clean English translation from LLM response
            import re
            
            # Clean up the response by removing common prefixes and suffixes
            translated_text = full_response
            
            # Remove common translator responses
            prefixes_to_remove = [
                'translation:', 'english:', 'english translation:', 'translated:', 'result:',
                'the english translation is:', 'the translation is:', 'in english:'
            ]
            
            for prefix in prefixes_to_remove:
                if translated_text.lower().startswith(prefix):
                    translated_text = translated_text[len(prefix):].strip()
            
            # Remove quotes if they wrap the entire response
            if translated_text.startswith('"') and translated_text.endswith('"'):
                translated_text = translated_text[1:-1].strip()
            
            # Take only the first sentence/line if there are multiple lines
            original_response = translated_text
            if '\n' in translated_text:
                translated_text = translated_text.split('\n')[0].strip()
                logger.info(f"Truncated multi-line response: '{original_response[:100]}...' -> '{translated_text}'")
            
            # Also limit by sentence endings for very long responses
            if len(translated_text) > 50 and any(punct in translated_text for punct in ['.', '!', '?']):
                sentences = []
                for punct in ['.', '!', '?']:
                    sentences.extend(translated_text.split(punct))
                if sentences:
                    translated_text = sentences[0].strip()
            
            # Check if translation seems to be in Turkish or too verbose (fallback needed)
            turkish_chars = ['ç', 'ğ', 'ı', 'ö', 'ş', 'ü', 'Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü']
            is_turkish_response = any(char in translated_text for char in turkish_chars)
            is_too_verbose = len(translated_text) > 100 or '\n' in original_response  # Check original for newlines
            is_too_short = len(translated_text.strip()) < 3
            
            # Check if translation is same as original (LLM failed to translate)
            is_same_as_original = translated_text.strip().lower() == query.strip().lower()
            
            logger.info(f"Translation analysis: text='{translated_text[:50]}...', turkish={is_turkish_response}, verbose={is_too_verbose}, short={is_too_short}, same_as_original={is_same_as_original}, length={len(translated_text)}")
            
            # Force fallback if any Turkish characters detected
            if any(char in translated_text for char in ['ç', 'ğ', 'ı', 'ö', 'ş', 'ü', 'Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü']):
                # Use dictionary-based fallback for common patterns
                if 'stok' in query.lower() and any(word in query.lower() for word in ['az', 'düşük', 'bul', 'olan']):
                    translated_text = "Find products with low stock"
                elif ('en çok satan' in query.lower() or 'en çok satılan' in query.lower() or 'bestseller' in query.lower()) and 'ürün' in query.lower():
                    translated_text = "Show best selling products"
                elif 'müşteri' in query.lower() and any(word in query.lower() for word in ['bul', 'göster', 'listele']):
                    translated_text = "Find customers"  
                elif 'sipariş' in query.lower() and any(word in query.lower() for word in ['bul', 'göster', 'listele']):
                    translated_text = "Find orders"
                elif 'satış' in query.lower() and any(word in query.lower() for word in ['trend', 'analiz', 'rapor']):
                    translated_text = "Show sales trends"
                elif 'satış' in query.lower() and any(word in query.lower() for word in ['aylık', 'monthly', 'ay']):
                    translated_text = "Show monthly sales"
                elif 'satış' in query.lower():
                    translated_text = "Show sales data"
                elif 'ürün' in query.lower() and any(word in query.lower() for word in ['bul', 'göster', 'listele', 'neler']):
                    translated_text = "Find products"
                elif 'veri' in query.lower() or 'bilgi' in query.lower():
                    translated_text = "Show data"
                elif any(word in query.lower() for word in ['top 10', 'en iyi', 'en yüksek']):
                    translated_text = "Show top 10"
                else:
                    translated_text = "Find data"  # Generic fallback
            
            logger.info(f"Translation completed: '{original_text}' -> '{translated_text}'")
            
            return jsonify({
                'status': 'success',
                'translated_text': translated_text,
                'original_text': original_text,
                'confidence': 0.9  # High confidence for LLM translations
            })
            
        except Exception as e:
            logger.error(f"Translation failed: {e}")
            return jsonify({
                'status': 'error',
                'message': f'Translation failed: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Translation endpoint error: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500