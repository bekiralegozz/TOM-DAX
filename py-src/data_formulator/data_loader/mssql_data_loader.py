import json
import pandas as pd
import duckdb
import pyodbc

from data_formulator.data_loader.external_data_loader import ExternalDataLoader, sanitize_table_name
from typing import Dict, Any, List

class MSSQLDataLoader(ExternalDataLoader):

    @staticmethod
    def list_params() -> List[Dict[str, Any]]:
        params_list = [
            {"name": "server", "type": "string", "required": True, "default": "localhost", "description": "SQL Server instance name or IP address"}, 
            {"name": "database", "type": "string", "required": True, "default": "", "description": "Database name to connect to"}, 
            {"name": "user", "type": "string", "required": True, "default": "", "description": "SQL Server username"}, 
            {"name": "password", "type": "string", "required": True, "default": "", "description": "SQL Server password"}, 
            {"name": "port", "type": "string", "required": False, "default": "1433", "description": "SQL Server port (default: 1433)"},
            {"name": "driver", "type": "string", "required": False, "default": "ODBC Driver 17 for SQL Server", "description": "ODBC driver name"},
            {"name": "schema_filter", "type": "string", "required": False, "default": "dbo", "description": "Schema filter (comma-separated, e.g., 'dbo,sales'). Default: 'dbo'"},
            {"name": "table_limit", "type": "string", "required": False, "default": "50", "description": "Maximum number of tables to list (default: 50)"},
            {"name": "table_name_pattern", "type": "string", "required": False, "default": "", "description": "Table name pattern filter (SQL LIKE, e.g., 'Dim%', '%fact%')"}
        ]
        return params_list

    @staticmethod
    def auth_instructions() -> str:
        return """
Microsoft SQL Server Connection Instructions:

1. Required Information:
   - Server: SQL Server instance name or IP address
   - Database: Target database name
   - User: SQL Server username with read permissions
   - Password: SQL Server password
   - Port: SQL Server port (default: 1433)

2. Performance Tuning for Large Databases:
   - Schema Filter: Specify schemas to scan (default: 'dbo'). Use comma-separated values for multiple schemas.
   - Table Limit: Maximum number of tables to process (default: 50). Set to 0 for no limit.
   - Table Name Pattern: SQL LIKE pattern to filter table names (e.g., 'Dim%' for dimension tables, '%fact%' for fact tables).

3. Connection Prerequisites:
   - SQL Server must allow SQL Server Authentication (not just Windows Auth)
   - User account must have db_datareader role on the target database
   - Firewall must allow connections on the specified port
   - TCP/IP protocol must be enabled in SQL Server Configuration Manager

4. Driver Requirements:
   - ODBC Driver 17 for SQL Server (recommended)
   - Alternative drivers: "SQL Server Native Client 11.0", "SQL Server"
   - On macOS: Install via `brew install msodbcsql17 mssql-tools`
   - On Linux: Follow Microsoft's ODBC driver installation guide

5. Example Connection for Large Database:
   - Server: "myserver.domain.com"
   - Database: "AdventureWorksDW2019"
   - User: "data_user"
   - Password: "SecurePassword123"
   - Schema Filter: "dbo,sales,marketing"
   - Table Limit: "100"
   - Table Name Pattern: "Dim%"

6. Troubleshooting:
   - Test connection: `sqlcmd -S server -d database -U user -P password`
   - For very large databases, start with specific schemas and small table limits
   - Use table name patterns to focus on relevant tables
   - If metadata loading is slow, reduce table limit or add more specific filters
        """

    def __init__(self, params: Dict[str, Any], duck_db_conn: duckdb.DuckDBPyConnection):
        self.params = params
        self.duck_db_conn = duck_db_conn
        
        # Extract parameters
        self.server = params.get("server", "localhost")
        self.database = params.get("database", "")
        self.user = params.get("user", "")
        self.password = params.get("password", "")
        self.port = params.get("port", "1433")
        self.driver = params.get("driver", "ODBC Driver 17 for SQL Server")
        
        # New filtering parameters
        self.schema_filter = params.get("schema_filter", "dbo")
        self.table_limit = int(params.get("table_limit", "50"))
        self.table_name_pattern = params.get("table_name_pattern", "")
        
        # Build connection string for pyodbc
        self.connection_string = f"Driver={{{self.driver}}};Server={self.server},{self.port};Database={self.database};UID={self.user};PWD={self.password};TrustServerCertificate=yes;"
        
        # Test the connection
        try:
            conn = pyodbc.connect(self.connection_string)
            conn.close()
            print(f"Successfully connected to SQL Server: {self.server}")
        except Exception as e:
            raise Exception(f"Failed to connect to SQL Server: {e}")

    def _get_connection(self):
        """Get a pyodbc connection to SQL Server."""
        return pyodbc.connect(self.connection_string)

    def list_tables(self) -> List[Dict[str, Any]]:
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Build the SQL query with filters
            base_query = """
                SELECT TABLE_SCHEMA, TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE'
                AND TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
            """
            
            # Add schema filter
            if self.schema_filter:
                schema_list = [f"'{schema.strip()}'" for schema in self.schema_filter.split(',') if schema.strip()]
                if schema_list:
                    base_query += f" AND TABLE_SCHEMA IN ({','.join(schema_list)})"
            
            # Add table name pattern filter
            if self.table_name_pattern:
                base_query += f" AND TABLE_NAME LIKE '{self.table_name_pattern}'"
            
            # Add ordering and limit
            base_query += " ORDER BY TABLE_SCHEMA, TABLE_NAME"
            
            print(f"Filtering tables: Schema='{self.schema_filter}', Pattern='{self.table_name_pattern}', Limit={self.table_limit}")
            cursor.execute(base_query)
            
            # Fetch limited number of tables
            all_tables = cursor.fetchall()
            tables = all_tables[:self.table_limit] if self.table_limit > 0 else all_tables
            
            print(f"Found {len(all_tables)} tables, processing {len(tables)} tables")
            
            results = []
            
            for schema, table_name in tables:
                try:
                    # Get column information
                    cursor.execute(f"""
                        SELECT COLUMN_NAME, DATA_TYPE 
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                        ORDER BY ORDINAL_POSITION
                    """, schema, table_name)
                    
                    columns_info = cursor.fetchall()
                    columns = [{
                        'name': col_name,
                        'type': data_type
                    } for col_name, data_type in columns_info]
                    
                    # Get sample data (top 5 rows for performance)
                    try:
                        cursor.execute(f"SELECT TOP 5 * FROM [{schema}].[{table_name}]")
                        sample_data = cursor.fetchall()
                        
                        # Convert to list of dictionaries
                        column_names = [col[0] for col in columns_info]
                        sample_rows = []
                        for row in sample_data:
                            row_dict = {}
                            for i, value in enumerate(row):
                                if i < len(column_names):
                                    # Convert datetime and other special types to string for JSON serialization
                                    if hasattr(value, 'isoformat'):
                                        row_dict[column_names[i]] = value.isoformat()
                                    elif value is None:
                                        row_dict[column_names[i]] = None
                                    else:
                                        row_dict[column_names[i]] = str(value)
                            sample_rows.append(row_dict)
                    except Exception as sample_error:
                        print(f"Could not get sample data from {schema}.{table_name}: {sample_error}")
                        sample_rows = []
                    
                    # Get row count (with timeout protection)
                    try:
                        cursor.execute(f"SELECT COUNT_BIG(*) FROM [{schema}].[{table_name}]")
                        row_count = cursor.fetchone()[0]
                    except:
                        # If count fails (e.g., timeout), set to unknown
                        row_count = -1
                    
                    table_metadata = {
                        "row_count": row_count,
                        "columns": columns,
                        "sample_rows": sample_rows
                    }
                    
                    full_table_name = f"{schema}.{table_name}"
                    results.append({
                        "name": full_table_name,
                        "metadata": table_metadata
                    })
                    
                except Exception as e:
                    print(f"Error processing table {schema}.{table_name}: {e}")
                    # Add basic info even if metadata fails
                    results.append({
                        "name": f"{schema}.{table_name}",
                        "metadata": {
                            "row_count": -1,
                            "columns": [],
                            "sample_rows": []
                        }
                    })
                    continue
            
            conn.close()
            return results
            
        except Exception as e:
            print(f"Error listing tables: {e}")
            return []

    def ingest_data(self, table_name: str, name_as: str = None, size: int = 1000000):
        # Create table in the main DuckDB database from SQL Server data
        if name_as is None:
            # Extract just the table name from the full path
            name_as = table_name.split('.')[-1]

        name_as = sanitize_table_name(name_as)

        try:
            conn = self._get_connection()
            
            # Split schema and table name
            if '.' in table_name:
                schema, table = table_name.split('.', 1)
                query = f"SELECT TOP {size} * FROM [{schema}].[{table}]"
            else:
                query = f"SELECT TOP {size} * FROM [{table_name}]"
            
            # Read data using pandas
            df = pd.read_sql(query, conn)
            conn.close()
            
            # Use the base class's method to ingest the DataFrame into DuckDB
            self.ingest_df_to_duckdb(df, name_as)
            
        except Exception as e:
            print(f"Error ingesting data: {e}")
            raise Exception(f"Failed to ingest data from SQL Server: {e}")

    def view_query_sample(self, query: str) -> List[Dict[str, Any]]:
        try:
            conn = self._get_connection()
            
            # Add TOP 10 to the query if it doesn't already have it
            if not query.strip().upper().startswith('SELECT TOP'):
                # Simple approach: if query starts with SELECT, inject TOP 10
                if query.strip().upper().startswith('SELECT'):
                    query = query.replace('SELECT', 'SELECT TOP 10', 1)
                else:
                    # For other queries, wrap them
                    query = f"SELECT TOP 10 * FROM ({query}) AS subquery"
            
            df = pd.read_sql(query, conn)
            conn.close()
            
            return df.to_dict(orient="records")
            
        except Exception as e:
            print(f"Error executing query sample: {e}")
            return []

    def ingest_data_from_query(self, query: str, name_as: str):
        try:
            conn = self._get_connection()
            
            # Execute the query and get results as a DataFrame
            df = pd.read_sql(query, conn)
            conn.close()
            
            # Use the base class's method to ingest the DataFrame
            self.ingest_df_to_duckdb(df, name_as)
            
        except Exception as e:
            print(f"Error ingesting data from query: {e}")
            raise 