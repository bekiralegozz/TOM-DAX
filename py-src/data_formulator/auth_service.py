import psycopg2
import hashlib
import os
from typing import Optional, Dict, Any
from datetime import datetime

class AuthService:
    def __init__(self):
        # PostgreSQL connection parameters
        self.db_config = {
            'host': 'tb34tstextdb01',
            'port': 5432,
            'database': 'ai_core',
            'user': 'ai_core_owner',
            'password': 'En6OtjrJxbREweki',
            'options': '-c search_path=public'
        }
        self.table_name = 'daxuserlist'
    
    def _get_connection(self):
        """Get a PostgreSQL database connection."""
        try:
            return psycopg2.connect(**self.db_config)
        except Exception as e:
            print(f"Database connection error: {e}")
            raise Exception(f"Failed to connect to authentication database: {e}")
    
    def _hash_password(self, password: str) -> str:
        """Hash password using SHA256."""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def verify_user(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """
        Verify user credentials against PostgreSQL database.
        Returns user info if valid, None if invalid.
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Check if user exists and password matches
            # Handle simple table structure with just username and password
            cursor.execute(f"""
                SELECT username, password
                FROM {self.table_name} 
                WHERE username = %s
            """, (username,))
            
            user_record = cursor.fetchone()
            
            if user_record:
                db_username, db_password = user_record
                
                # Hash the provided password and compare
                hashed_password = self._hash_password(password)
                
                if db_password == hashed_password:
                    cursor.close()
                    conn.close()
                    
                    return {
                        'id': 1,  # Simple ID for basic auth
                        'username': db_username,
                        'created_at': datetime.now(),
                        'last_login': datetime.now(),
                        'is_active': True
                    }
            
            cursor.close()
            conn.close()
            return None
            
        except Exception as e:
            print(f"Authentication error: {e}")
            return None
    
    def check_table_structure(self) -> Dict[str, Any]:
        """
        Check the structure of the user table to understand what columns exist.
        This is helpful for debugging and setup.
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Get table structure
            cursor.execute(f"""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = %s AND table_schema = 'public'
                ORDER BY ordinal_position
            """, (self.table_name,))
            
            columns = cursor.fetchall()
            
            # Get sample data
            cursor.execute(f"SELECT * FROM {self.table_name} LIMIT 3")
            sample_data = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return {
                'table_exists': len(columns) > 0,
                'columns': [{'name': col[0], 'type': col[1], 'nullable': col[2], 'default': col[3]} for col in columns],
                'sample_count': len(sample_data),
                'table_name': self.table_name
            }
            
        except Exception as e:
            return {
                'table_exists': False,
                'error': str(e),
                'table_name': self.table_name
            }
    
    def create_user(self, username: str, password: str) -> bool:
        """
        Create a new user (for testing purposes).
        In production, this would typically be handled by an admin interface.
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Check if user already exists
            cursor.execute(f"SELECT username FROM {self.table_name} WHERE username = %s", (username,))
            if cursor.fetchone():
                print(f"User {username} already exists")
                cursor.close()
                conn.close()
                return False
            
            # Create new user with simple table structure
            hashed_password = self._hash_password(password)
            cursor.execute(f"""
                INSERT INTO {self.table_name} (username, password) 
                VALUES (%s, %s)
            """, (username, hashed_password))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            print(f"User {username} created successfully")
            return True
            
        except Exception as e:
            print(f"Error creating user: {e}")
            return False 