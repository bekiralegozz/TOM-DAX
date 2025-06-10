import React, { useState } from 'react';
import { 
    Box, 
    Button, 
    TextField, 
    Typography, 
    Alert, 
    Paper, 
    Container,
    CircularProgress
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { API_ENDPOINTS } from '../config/api';

const LoginContainer = styled(Container)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
}));

const LoginPaper = styled(Paper)(({ theme }) => ({
    padding: theme.spacing(4),
    borderRadius: theme.spacing(2),
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
    minWidth: 400,
    backdropFilter: 'blur(10px)',
    background: 'rgba(255, 255, 255, 0.95)',
}));

const LogoText = styled(Typography)(({ theme }) => ({
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    marginBottom: theme.spacing(3),
    textAlign: 'center',
}));

interface LoginProps {
    onLoginSuccess: (user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        console.log('🔍 Login attempt started');
        console.log('📡 API Endpoint:', API_ENDPOINTS.AUTH.LOGIN);

        try {
            console.log('🚀 Sending login request...');
            const response = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
                credentials: 'include'
            });

            console.log('📨 Response received:', response.status, response.statusText);
            console.log('📨 Response headers:', [...response.headers.entries()]);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('✅ Response data:', data);

            if (data.success) {
                onLoginSuccess(data.user);
            } else {
                setError(data.message || 'Login failed');
            }
        } catch (err) {
            console.error('❌ Login error details:', err);
            console.error('❌ Error type:', typeof err);
            console.error('❌ Error message:', err instanceof Error ? err.message : String(err));
            
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <LoginContainer maxWidth={false}>
            <LoginPaper elevation={3}>
                <LogoText variant="h3">
                    DAX
                </LogoText>
                
                <Typography variant="h5" gutterBottom align="center" color="text.secondary">
                    Welcome Back
                </Typography>
                
                <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
                    Sign in to access your DAX dashboard
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="username"
                        label="Username"
                        name="username"
                        autoComplete="username"
                        autoFocus
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={loading}
                        variant="outlined"
                    />
                    
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="password"
                        label="Password"
                        type="password"
                        id="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        variant="outlined"
                    />
                    
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        disabled={loading}
                        sx={{ 
                            mt: 3, 
                            mb: 2, 
                            py: 1.5,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                            }
                        }}
                    >
                        {loading ? (
                            <CircularProgress size={24} color="inherit" />
                        ) : (
                            'Sign In'
                        )}
                    </Button>
                    
                    <Typography variant="body2" color="text.secondary" align="center">
                        Powered by Bekir Alegoz
                    </Typography>
                </Box>
            </LoginPaper>
        </LoginContainer>
    );
}; 