import React, { useState, useEffect, useRef } from 'react';
import {
    Card,
    CardContent,
    Typography,
    Button,
    Box,
    TextField,
    CircularProgress,
    Alert,
    Paper,
    Chip,
    Divider,
    IconButton,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Tooltip,
    Switch
} from '@mui/material';

import {
    Send as SendIcon,
    Psychology as AIIcon,
    Code as CodeIcon,
    ExpandMore as ExpandMoreIcon,
    Storage as StorageIcon,
    TableChart as TableIcon,
    Lightbulb as LightbulbIcon,
    Help as HelpIcon,
    ContentCopy as CopyIcon,
    PlayArrow as ExecuteIcon,
    Clear as ClearIcon,
    Analytics as AnalyticsIcon,
    Person as PersonIcon,
    Edit as EditIcon
} from '@mui/icons-material';

import { getUrls } from '../app/utils';
import { useSelector, useDispatch } from 'react-redux';
import { dfSelectors, dfActions } from '../app/dfSlice';
import { smartTranslateTurkishToEnglish, isTurkishText, getTranslationSuggestions, TranslationResult } from '../utils/translationUtils';

interface IndexedDatabase {
    database_id: number;
    data_loader_type: string;
    connection_name: string;
    total_tables: number;
    total_schemas: number;
    indexed_at: string;
    status: string;
}

interface NLPResponse {
    status: string;
    original_query: string;
    sql_query: string;
    analysis: {
        intent: string;
        identified_entities: string[];
        selected_tables: Array<{
            table_name: string;
            reason: string;
            confidence: number;
        }>;
        column_mappings: Array<{
            natural_term: string;
            column_name: string;
            table_name: string;
            confidence: number;
        }>;
        query_type: string;
        complexity: string;
        assumptions: string[];
    };
    explanation: string;
    database_context: {
        database_name: string;
        available_tables: string[];
    };
}

interface ChatMessage {
    id: string;
    type: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sqlQuery?: string;
    analysis?: any;
    explanation?: string;
}

interface NLPChatDialogProps {
    buttonElement: React.ReactNode;
}

export const NLPChat: React.FC<NLPChatDialogProps> = ({ buttonElement }) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                variant="text"
                onClick={() => setOpen(true)}
                sx={{ textTransform: 'none' }}
            >
                {buttonElement}
            </Button>
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>Chat with AI</DialogTitle>
                <DialogContent>
                    <NLPChatContent />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export const NLPChatContent: React.FC = () => {
    const [indexedDatabases, setIndexedDatabases] = useState<IndexedDatabase[]>([]);
    const [selectedDatabaseId, setSelectedDatabaseId] = useState<number | null>(null);
    const [contextMode, setContextMode] = useState<'full' | 'compact'>('full');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputQuery, setInputQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
    const [improvementsDialog, setImprovementsDialog] = useState<{open: boolean, suggestions: any} | null>(null);
    
    const chatEndRef = useRef<HTMLDivElement>(null);
    const activeModel = useSelector(dfSelectors.getActiveModel);
    const dispatch = useDispatch();

    const [importDialog, setImportDialog] = useState<{open: boolean, sql: string, tableName: string}>({
        open: false,
        sql: '',
        tableName: ''
    });

    const [enhancementMode, setEnhancementMode] = useState<{messageId: string, sql: string} | null>(null);
    const [enhancementQuery, setEnhancementQuery] = useState('');
    const [autoTranslate, setAutoTranslate] = useState(true);
    const [translating, setTranslating] = useState(false);

    useEffect(() => {
        loadIndexedDatabases();
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadIndexedDatabases = async () => {
        try {
            const response = await fetch(`/api/indexing/list-indexed-databases`);
            const data = await response.json();
            
            if (data.status === 'success') {
                setIndexedDatabases(data.databases);
                if (data.databases.length > 0 && !selectedDatabaseId) {
                    setSelectedDatabaseId(data.databases[0].database_id);
                }
            }
        } catch (error) {
            console.error('Failed to load indexed databases:', error);
        }
    };

    const handleSendQuery = async () => {
        if (!inputQuery.trim() || !selectedDatabaseId) return;

        // Check if text is Turkish and translate if auto-translate is enabled
        const originalQuery = inputQuery;
        let processedQuery = inputQuery;
        let translationInfo = null;

        if (autoTranslate && isTurkishText(originalQuery)) {
            setTranslating(true);
            try {
                const translationResult = await smartTranslateTurkishToEnglish(originalQuery, activeModel);
                processedQuery = translationResult.translatedText;
                translationInfo = {
                    original: translationResult.originalText,
                    translated: translationResult.translatedText,
                    confidence: translationResult.confidence,
                    suggestions: getTranslationSuggestions(translationResult)
                };
                console.log('Turkish detected and translated:', translationInfo);
            } catch (error) {
                console.error('Translation failed:', error);
                // Continue with original query if translation fails
                processedQuery = originalQuery;
            } finally {
                setTranslating(false);
            }
        }

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            type: 'user',
            content: originalQuery, // Show original Turkish text to user
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputQuery('');
        setLoading(true);

        // Show translation info if translation occurred
        if (translationInfo && translationInfo.translated !== translationInfo.original) {
            const confidence = Math.round(translationInfo.confidence * 100);
            const translationMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                type: 'assistant',
                content: `🔄 Automatically translated (${confidence}% confidence): "${translationInfo.original}" → "${translationInfo.translated}"`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, translationMessage]);
        }

        try {
            console.log('Sending request:', {
                database_id: selectedDatabaseId,
                natural_query: processedQuery, // Send translated query to backend
                model: activeModel,
                context_mode: contextMode
            });

            const response = await fetch(`/api/indexing/enhanced-nlp-to-sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    database_id: selectedDatabaseId,
                    natural_query: processedQuery,
                    model: activeModel,
                    context_mode: contextMode
                })
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data: NLPResponse = await response.json();
            
            // Debug: Log the full response
            console.log('=== FULL NLP RESPONSE ===');
            console.log(JSON.stringify(data, null, 2));
            console.log('=== SQL QUERY ===');
            console.log(data.sql_query);
            console.log('=== ANALYSIS ===');
            console.log(data.analysis);
            console.log('=== EXPLANATION ===');
            console.log(data.explanation);

            if (data.status === 'success') {
                const assistantMessage: ChatMessage = {
                    id: (Date.now() + 1).toString(),
                    type: 'assistant',
                    content: data.explanation || 'SQL query generated successfully',
                    timestamp: new Date(),
                    sqlQuery: data.sql_query,
                    analysis: data.analysis,
                    explanation: data.explanation
                };

                setMessages(prev => [...prev, assistantMessage]);
            } else {
                const errorMessage: ChatMessage = {
                    id: (Date.now() + 1).toString(),
                    type: 'assistant',
                    content: `Error: ${'message' in data ? data.message : 'Failed to generate SQL query'}`,
                    timestamp: new Date()
                };

                setMessages(prev => [...prev, errorMessage]);
            }
        } catch (error) {
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                type: 'assistant',
                content: 'Error: Failed to connect to the server',
                timestamp: new Date()
            };

            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const handleCopySQL = (sql: string) => {
        navigator.clipboard.writeText(sql);
        setMessage({type: 'success', text: 'SQL copied to clipboard'});
        setTimeout(() => setMessage(null), 3000);
    };

    const handleGetImprovements = async (sql: string) => {
        if (!selectedDatabaseId) return;

        try {
            const response = await fetch(`/api/indexing/suggest-sql-improvements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    database_id: selectedDatabaseId,
                    sql_query: sql,
                    model: activeModel
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                setImprovementsDialog({
                    open: true,
                    suggestions: data.suggestions
                });
            } else {
                setMessage({type: 'error', text: 'Failed to get improvement suggestions'});
            }
        } catch (error) {
            setMessage({type: 'error', text: 'Failed to get improvement suggestions'});
        }
    };

    const handleExecuteSQL = async (sql: string) => {
        // Show import dialog with suggested table name
        const suggestedName = `query_result_${Date.now()}`;
        setImportDialog({
            open: true,
            sql: sql,
            tableName: suggestedName
        });
    };

    const handleConfirmImport = async () => {
        if (!selectedDatabaseId) return;

        let { sql, tableName } = importDialog;
        
        try {
            // Get database connection info
            const connResponse = await fetch(`/api/indexing/get-database-connection/${selectedDatabaseId}`);
            const connData = await connResponse.json();
            
            if (connData.status !== 'success') {
                throw new Error('Failed to get database connection info');
            }

            // Execute SQL and import as table
            const response = await fetch(`/api/tables/load-database-table`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data_loader_type: connData.connection_info.data_loader_type,
                    connection_params: connData.connection_info.connection_params,
                    table_name: tableName,
                    custom_sql: sql
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                // Import the table to data threads
                dispatch(dfActions.loadTable({
                    id: tableName,
                    displayId: tableName,
                    names: Object.keys(data.rows?.[0] || {}),
                    types: [], // Will be inferred by the system
                    rows: data.rows || [],
                    anchored: true
                }));
                
                setMessage({type: 'success', text: `SQL executed and imported as "${tableName}" in Data Threads`});
                setImportDialog({open: false, sql: '', tableName: ''});
            } else {
                setMessage({type: 'error', text: 'SQL execution failed: ' + (data.message || 'Unknown error')});
            }
        } catch (error) {
            setMessage({type: 'error', text: 'Failed to execute SQL and import table'});
        }
    };

    const handleEnhanceSQL = async (originalSQL: string, enhancementRequest: string) => {
        if (!enhancementRequest.trim() || !selectedDatabaseId) return;

        setLoading(true);

        try {
            // Translate enhancement request if it's Turkish
            let processedEnhancementRequest = enhancementRequest;
            if (autoTranslate && isTurkishText(enhancementRequest)) {
                try {
                    const translationResult = await smartTranslateTurkishToEnglish(enhancementRequest, activeModel);
                    processedEnhancementRequest = translationResult.translatedText;
                    console.log('Enhanced request translated:', enhancementRequest, '→', processedEnhancementRequest);
                } catch (error) {
                    console.error('Enhancement request translation failed:', error);
                    // Continue with original request if translation fails
                    processedEnhancementRequest = enhancementRequest;
                }
            }

            const enhancedQuery = `Modify this SQL query: "${originalSQL}" to ${processedEnhancementRequest}`;
            
            const response = await fetch(`/api/indexing/enhanced-nlp-to-sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    database_id: selectedDatabaseId,
                    natural_query: enhancedQuery,
                    model: activeModel,
                    context_mode: contextMode,
                    original_sql: originalSQL
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                const assistantMessage: ChatMessage = {
                    id: Date.now().toString(),
                    type: 'assistant',
                    content: `Enhanced SQL query based on: "${enhancementRequest}"`,
                    timestamp: new Date(),
                    sqlQuery: data.sql_query,
                    analysis: data.analysis,
                    explanation: data.explanation
                };

                setMessages(prev => [...prev, assistantMessage]);
                setEnhancementMode(null);
                setEnhancementQuery('');
                
                setMessage({ type: 'success', text: 'SQL query enhanced successfully!' });
                setTimeout(() => setMessage(null), 3000);
            } else {
                setMessage({ type: 'error', text: data.message || 'Failed to enhance SQL query' });
                setTimeout(() => setMessage(null), 5000);
            }
        } catch (error) {
            console.error('Error enhancing SQL:', error);
            setMessage({ type: 'error', text: 'Failed to enhance SQL query' });
            setTimeout(() => setMessage(null), 5000);
        } finally {
            setLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([]);
    };

    const renderMessage = (msg: ChatMessage) => {
        const isUser = msg.type === 'user';
        
        return (
            <Box
                key={msg.id}
                sx={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    mb: 3,
                    animation: 'slideIn 0.3s ease-out',
                    '@keyframes slideIn': {
                        '0%': { opacity: 0, transform: 'translateY(20px)' },
                        '100%': { opacity: 1, transform: 'translateY(0)' }
                    }
                }}
            >
                {!isUser && (
                    <Box sx={{
                        mr: 2,
                        mt: 0.5,
                        background: 'linear-gradient(45deg, #667eea, #764ba2)',
                        borderRadius: '50%',
                        p: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 40,
                        height: 40,
                        flexShrink: 0
                    }}>
                        <AIIcon sx={{ fontSize: 20, color: 'white' }} />
                    </Box>
                )}
                
                <Paper
                    elevation={isUser ? 8 : 4}
                    sx={{
                        maxWidth: '75%',
                        p: 3,
                        backgroundColor: isUser 
                            ? 'linear-gradient(45deg, #667eea, #764ba2)' 
                            : 'rgba(255, 255, 255, 0.95)',
                        background: isUser 
                            ? 'linear-gradient(45deg, #667eea, #764ba2)' 
                            : 'rgba(255, 255, 255, 0.95)',
                        color: isUser ? 'white' : 'text.primary',
                        borderRadius: isUser ? '20px 20px 5px 20px' : '20px 20px 20px 5px',
                        backdropFilter: 'blur(10px)',
                        border: isUser ? 'none' : '1px solid rgba(102, 126, 234, 0.2)',
                        boxShadow: isUser 
                            ? '0 8px 25px rgba(102, 126, 234, 0.3)' 
                            : '0 4px 20px rgba(0, 0, 0, 0.1)',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: isUser 
                                ? '0 12px 35px rgba(102, 126, 234, 0.4)' 
                                : '0 8px 25px rgba(0, 0, 0, 0.15)'
                        }
                    }}
                >
                    <Typography 
                        variant="body1" 
                        sx={{ 
                            mb: 1,
                            lineHeight: 1.6,
                            fontSize: '16px',
                            color: isUser ? 'white' : '#333'
                        }}
                    >
                        {msg.content}
                    </Typography>
                    
                    <Typography 
                        variant="caption" 
                        sx={{ 
                            opacity: 0.8,
                            fontSize: '12px',
                            color: isUser ? 'rgba(255,255,255,0.8)' : 'text.secondary'
                        }}
                    >
                        {msg.timestamp.toLocaleTimeString()}
                    </Typography>

                    {/* SQL Query Display */}
                    {msg.sqlQuery && (
                        <Box sx={{ mt: 3 }}>
                            <Divider sx={{ 
                                mb: 2, 
                                borderColor: 'rgba(102, 126, 234, 0.2)'
                            }} />
                            <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 1, 
                                mb: 2,
                                background: 'rgba(102, 126, 234, 0.1)',
                                p: 2,
                                borderRadius: 2
                            }}>
                                <CodeIcon sx={{ color: '#667eea' }} />
                                <Typography 
                                    variant="subtitle2" 
                                    sx={{ 
                                        color: '#667eea',
                                        fontWeight: 600,
                                        flex: 1
                                    }}
                                >
                                    Generated SQL Query
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Tooltip title="Copy SQL">
                                        <IconButton 
                                            size="small" 
                                            onClick={() => handleCopySQL(msg.sqlQuery!)}
                                            sx={{
                                                background: 'rgba(102, 126, 234, 0.1)',
                                                '&:hover': {
                                                    background: '#667eea',
                                                    color: 'white',
                                                    transform: 'scale(1.1)'
                                                }
                                            }}
                                        >
                                            <CopyIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Get Improvement Suggestions">
                                        <IconButton 
                                            size="small" 
                                            onClick={() => handleGetImprovements(msg.sqlQuery!)}
                                            sx={{
                                                background: 'rgba(255, 193, 7, 0.1)',
                                                '&:hover': {
                                                    background: '#ffc107',
                                                    color: 'white',
                                                    transform: 'scale(1.1)'
                                                }
                                            }}
                                        >
                                            <LightbulbIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Execute SQL and Import as Table">
                                        <IconButton 
                                            size="small" 
                                            onClick={() => handleExecuteSQL(msg.sqlQuery!)}
                                            sx={{
                                                background: 'rgba(76, 175, 80, 0.1)',
                                                '&:hover': {
                                                    background: '#4caf50',
                                                    color: 'white',
                                                    transform: 'scale(1.1)'
                                                }
                                            }}
                                        >
                                            <ExecuteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Enhance SQL with Natural Language">
                                        <IconButton 
                                            size="small" 
                                            onClick={() => setEnhancementMode({
                                                messageId: msg.id,
                                                sql: msg.sqlQuery!
                                            })}
                                            sx={{
                                                background: 'rgba(156, 39, 176, 0.1)',
                                                '&:hover': {
                                                    background: '#9c27b0',
                                                    color: 'white',
                                                    transform: 'scale(1.1)'
                                                }
                                            }}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                            <Paper 
                                sx={{ 
                                    p: 3, 
                                    background: 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
                                    color: '#e0e0e0',
                                    fontFamily: '"Fira Code", "Monaco", "Menlo", monospace',
                                    fontSize: '14px',
                                    overflow: 'auto',
                                    borderRadius: 3,
                                    border: '1px solid rgba(102, 126, 234, 0.3)',
                                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3)',
                                    position: 'relative',
                                    '&::before': {
                                        content: '"SQL"',
                                        position: 'absolute',
                                        top: 8,
                                        right: 12,
                                        fontSize: '10px',
                                        color: '#667eea',
                                        background: 'rgba(102, 126, 234, 0.2)',
                                        px: 1,
                                        py: 0.5,
                                        borderRadius: 1
                                    }
                                }}
                            >
                                <pre style={{ 
                                    margin: 0, 
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.5
                                }}>
                                    {msg.sqlQuery}
                                </pre>
                            </Paper>

                            {/* Enhancement Input */}
                            {enhancementMode?.messageId === msg.id && (
                                <Box sx={{ 
                                    mt: 2, 
                                    p: 2, 
                                    background: 'rgba(156, 39, 176, 0.1)', 
                                    borderRadius: 2,
                                    border: '1px solid rgba(156, 39, 176, 0.3)'
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        <EditIcon sx={{ color: '#9c27b0' }} />
                                        <Typography 
                                            variant="subtitle2" 
                                            sx={{ 
                                                color: '#9c27b0',
                                                fontWeight: 600 
                                            }}
                                        >
                                            Enhance SQL Query
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            placeholder="e.g., add limit 10, sort by date descending, include customer names..."
                                            value={enhancementQuery}
                                            onChange={(e) => setEnhancementQuery(e.target.value)}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleEnhanceSQL(enhancementMode.sql, enhancementQuery);
                                                }
                                            }}
                                            disabled={loading}
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    background: 'rgba(255, 255, 255, 0.9)',
                                                    '&:hover fieldset': {
                                                        borderColor: '#9c27b0'
                                                    },
                                                    '&.Mui-focused fieldset': {
                                                        borderColor: '#9c27b0'
                                                    }
                                                }
                                            }}
                                        />
                                        <Button
                                            variant="contained"
                                            size="small"
                                            onClick={() => handleEnhanceSQL(enhancementMode.sql, enhancementQuery)}
                                            disabled={loading || !enhancementQuery.trim()}
                                            sx={{
                                                background: 'linear-gradient(45deg, #9c27b0, #e91e63)',
                                                '&:hover': {
                                                    background: 'linear-gradient(45deg, #7b1fa2, #c2185b)'
                                                },
                                                minWidth: '80px'
                                            }}
                                        >
                                            {loading ? <CircularProgress size={16} color="inherit" /> : 'Enhance'}
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => {
                                                setEnhancementMode(null);
                                                setEnhancementQuery('');
                                            }}
                                            sx={{
                                                borderColor: '#9c27b0',
                                                color: '#9c27b0',
                                                '&:hover': {
                                                    borderColor: '#7b1fa2',
                                                    background: 'rgba(156, 39, 176, 0.1)'
                                                }
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                    </Box>
                                    <Typography 
                                        variant="caption" 
                                        sx={{ 
                                            mt: 1, 
                                            display: 'block',
                                            color: '#9c27b0',
                                            opacity: 0.8
                                        }}
                                    >
                                        Describe how you want to modify the SQL query above using natural language
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    )}

                    {/* Analysis Display */}
                    {msg.analysis && (
                        <Box sx={{ mt: 3 }}>
                            <Accordion 
                                sx={{
                                    background: 'rgba(102, 126, 234, 0.05)',
                                    borderRadius: 2,
                                    '&:before': { display: 'none' },
                                    boxShadow: 'none',
                                    border: '1px solid rgba(102, 126, 234, 0.2)'
                                }}
                            >
                                <AccordionSummary 
                                    expandIcon={<ExpandMoreIcon sx={{ color: '#667eea' }} />}
                                    sx={{
                                        borderRadius: 2,
                                        '&:hover': {
                                            background: 'rgba(102, 126, 234, 0.1)'
                                        }
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <AnalyticsIcon sx={{ color: '#667eea' }} />
                                        <Typography 
                                            variant="subtitle2" 
                                            sx={{ 
                                                color: '#667eea',
                                                fontWeight: 600 
                                            }}
                                        >
                                            Query Analysis
                                        </Typography>
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails sx={{ pt: 0 }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <Box sx={{ 
                                            background: 'rgba(255, 255, 255, 0.8)', 
                                            p: 2, 
                                            borderRadius: 2,
                                            border: '1px solid rgba(102, 126, 234, 0.1)'
                                        }}>
                                            <Typography variant="caption" sx={{ 
                                                color: '#667eea',
                                                fontWeight: 600,
                                                textTransform: 'uppercase',
                                                fontSize: '11px'
                                            }}>
                                                Intent
                                            </Typography>
                                            <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                                                {msg.analysis.intent}
                                            </Typography>
                                        </Box>
                                        
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                                            <Typography variant="caption" sx={{ 
                                                color: '#667eea',
                                                fontWeight: 600,
                                                textTransform: 'uppercase',
                                                fontSize: '11px'
                                            }}>
                                                Query Type:
                                            </Typography>
                                            <Chip 
                                                label={msg.analysis.query_type} 
                                                size="small"
                                                sx={{
                                                    background: 'linear-gradient(45deg, #667eea, #764ba2)',
                                                    color: 'white',
                                                    fontWeight: 600
                                                }}
                                            />
                                            <Chip 
                                                label={msg.analysis.complexity} 
                                                size="small" 
                                                color={msg.analysis.complexity === 'simple' ? 'success' : 
                                                       msg.analysis.complexity === 'medium' ? 'warning' : 'error'}
                                                sx={{ fontWeight: 600 }}
                                            />
                                        </Box>

                                        {msg.analysis.selected_tables && msg.analysis.selected_tables.length > 0 && (
                                            <Box>
                                                <Typography variant="caption" sx={{ 
                                                    color: '#667eea',
                                                    fontWeight: 600,
                                                    textTransform: 'uppercase',
                                                    fontSize: '11px'
                                                }}>
                                                    Selected Tables
                                                </Typography>
                                                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                                    {msg.analysis.selected_tables.map((table: any, idx: number) => (
                                                        <Chip 
                                                            key={idx}
                                                            label={`${table.table_name} (${Math.round(table.confidence * 100)}%)`}
                                                            size="small" 
                                                            variant="outlined"
                                                            sx={{ 
                                                                borderColor: '#667eea',
                                                                color: '#667eea',
                                                                fontWeight: 500,
                                                                '&:hover': {
                                                                    background: 'rgba(102, 126, 234, 0.1)'
                                                                }
                                                            }}
                                                        />
                                                    ))}
                                                </Box>
                                            </Box>
                                        )}

                                        {msg.analysis.assumptions && msg.analysis.assumptions.length > 0 && (
                                            <Box sx={{ 
                                                background: 'rgba(255, 193, 7, 0.1)', 
                                                p: 2, 
                                                borderRadius: 2,
                                                border: '1px solid rgba(255, 193, 7, 0.3)'
                                            }}>
                                                <Typography variant="caption" sx={{ 
                                                    color: '#f57c00',
                                                    fontWeight: 600,
                                                    textTransform: 'uppercase',
                                                    fontSize: '11px'
                                                }}>
                                                    Assumptions Made
                                                </Typography>
                                                <List dense sx={{ mt: 1 }}>
                                                    {msg.analysis.assumptions.map((assumption: string, idx: number) => (
                                                        <ListItem key={idx} sx={{ py: 0.5, px: 0 }}>
                                                            <ListItemText 
                                                                primary={`• ${assumption}`}
                                                                primaryTypographyProps={{ 
                                                                    variant: 'body2',
                                                                    color: '#e65100',
                                                                    fontWeight: 500
                                                                }}
                                                            />
                                                        </ListItem>
                                                    ))}
                                                </List>
                                            </Box>
                                        )}
                                    </Box>
                                </AccordionDetails>
                            </Accordion>
                        </Box>
                    )}
                </Paper>
                
                {isUser && (
                    <Box sx={{
                        ml: 2,
                        mt: 0.5,
                        background: 'rgba(255, 255, 255, 0.2)',
                        borderRadius: '50%',
                        p: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        border: '2px solid rgba(255, 255, 255, 0.3)'
                    }}>
                        <PersonIcon sx={{ fontSize: 20, color: 'white' }} />
                    </Box>
                )}
            </Box>
        );
    };

    const selectedDatabase = indexedDatabases.find(db => db.database_id === selectedDatabaseId);

    const sendMessage = () => {
        if (inputQuery.trim() && !loading) {
            handleSendQuery();
        }
    };

    return (
        <Box sx={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Animated background elements */}
            <Box sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0.1,
                pointerEvents: 'none',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: '20%',
                    left: '10%',
                    width: '300px',
                    height: '300px',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                    borderRadius: '50%',
                    animation: 'float 6s ease-in-out infinite'
                },
                '&::after': {
                    content: '""',
                    position: 'absolute',
                    bottom: '20%',
                    right: '10%',
                    width: '200px',
                    height: '200px',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)',
                    borderRadius: '50%',
                    animation: 'float 8s ease-in-out infinite reverse'
                },
                '@keyframes float': {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-20px)' }
                }
            }} />

            {/* Header */}
            <Card sx={{ 
                m: 2, 
                background: 'rgba(255, 255, 255, 0.95)', 
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
            }}>
                <CardContent sx={{ pb: '16px !important' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h5" sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1,
                            background: 'linear-gradient(45deg, #667eea, #764ba2)',
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontWeight: 'bold'
                        }}>
                            <AIIcon sx={{ color: '#667eea' }} />
                            AI Data Assistant
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <FormControl size="small" sx={{ minWidth: 200 }}>
                                <InputLabel>Database</InputLabel>
                                <Select
                                    value={selectedDatabaseId || ''}
                                    onChange={(e) => setSelectedDatabaseId(Number(e.target.value))}
                                    label="Database"
                                    sx={{
                                        borderRadius: 2,
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: 'rgba(102, 126, 234, 0.3)'
                                        }
                                    }}
                                >
                                    {indexedDatabases.map((db) => (
                                        <MenuItem key={db.database_id} value={db.database_id}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <StorageIcon fontSize="small" color="primary" />
                                                {db.connection_name}
                                                <Chip 
                                                    label={`${db.total_tables} tables`} 
                                                    size="small" 
                                                    variant="outlined"
                                                    sx={{ borderColor: '#667eea', color: '#667eea' }}
                                                />
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                                <InputLabel>Context</InputLabel>
                                <Select
                                    value={contextMode}
                                    onChange={(e) => setContextMode(e.target.value as 'full' | 'compact')}
                                    label="Context"
                                    sx={{
                                        borderRadius: 2,
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: 'rgba(102, 126, 234, 0.3)'
                                        }
                                    }}
                                >
                                    <MenuItem value="full">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Chip label="Full" size="small" color="primary" />
                                            Detailed context
                                        </Box>
                                    </MenuItem>
                                    <MenuItem value="compact">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Chip label="Compact" size="small" color="secondary" />
                                            Minimal context
                                        </Box>
                                    </MenuItem>
                                </Select>
                            </FormControl>
                            <Tooltip title="Automatically translate Turkish queries to English">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" sx={{ color: '#667eea', fontSize: '12px' }}>
                                        TR→EN
                                    </Typography>
                                    <Switch
                                        checked={autoTranslate}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAutoTranslate(e.target.checked)}
                                        size="small"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': {
                                                color: '#667eea',
                                            },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                backgroundColor: '#667eea',
                                            },
                                        }}
                                    />
                                </Box>
                            </Tooltip>
                            <Button
                                variant="outlined"
                                startIcon={<ClearIcon />}
                                onClick={clearChat}
                                disabled={messages.length === 0}
                                sx={{ 
                                    textTransform: 'none',
                                    borderRadius: 2,
                                    borderColor: 'rgba(102, 126, 234, 0.5)',
                                    color: '#667eea',
                                    '&:hover': {
                                        borderColor: '#667eea',
                                        background: 'rgba(102, 126, 234, 0.1)'
                                    }
                                }}
                            >
                                Clear Chat
                            </Button>
                        </Box>
                    </Box>
                    
                    {selectedDatabase && (
                        <Box sx={{ mt: 2, p: 2, background: 'rgba(102, 126, 234, 0.1)', borderRadius: 2 }}>
                            <Typography variant="body2" sx={{ color: '#667eea', fontWeight: 500 }}>
                                Connected to: {selectedDatabase.connection_name} 
                                ({selectedDatabase.data_loader_type.toUpperCase()}) - 
                                {selectedDatabase.total_tables} tables across {selectedDatabase.total_schemas} schemas
                            </Typography>
                        </Box>
                    )}
                </CardContent>
            </Card>

            {message && (
                <Alert 
                    severity={message.type} 
                    onClose={() => setMessage(null)}
                    sx={{ 
                        mx: 2, 
                        mb: 2,
                        borderRadius: 2,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    {message.text}
                </Alert>
            )}

            {/* Chat Messages */}
            <Card sx={{ 
                flex: 1, 
                mx: 2, 
                mb: 2,
                display: 'flex', 
                flexDirection: 'column',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
            }}>
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 0 }}>
                    <Box 
                        className="chat-scrollbar"
                        sx={{ 
                            flex: 1, 
                            overflow: 'auto', 
                            p: 2,
                            background: 'linear-gradient(to bottom, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05))'
                        }}
                    >
                        {messages.length === 0 ? (
                            <Box sx={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                height: '100%',
                                animation: 'fadeIn 1s ease-in'
                            }}>
                                <Box sx={{
                                    background: 'linear-gradient(45deg, #667eea, #764ba2)',
                                    borderRadius: '50%',
                                    p: 3,
                                    mb: 3,
                                    animation: 'pulse 2s ease-in-out infinite'
                                }}>
                                    <AIIcon sx={{ fontSize: 48, color: 'white' }} />
                                </Box>
                                <Typography variant="h5" gutterBottom sx={{ 
                                    background: 'linear-gradient(45deg, #667eea, #764ba2)',
                                    backgroundClip: 'text',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    fontWeight: 'bold',
                                    mb: 2
                                }}>
                                    Ask me anything about your data
                                </Typography>
                                <Typography variant="body1" textAlign="center" sx={{ 
                                    maxWidth: 500, 
                                    color: 'text.secondary',
                                    lineHeight: 1.6,
                                    mb: 3
                                }}>
                                    I can help you explore your data with natural language queries. 
                                    Just describe what you're looking for, and I'll generate the perfect SQL query for you.
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                                    {(autoTranslate ? [
                                        "En çok gelir getiren 10 müşteriyi göster",
                                        "Aylık satış trendleri nedir?", 
                                        "Stoku az olan ürünleri bul",
                                        "Show me top 10 customers by revenue",
                                        "What are the monthly sales trends?",
                                        "Find products with low inventory"
                                    ] : [
                                        "Show me top 10 customers by revenue",
                                        "What are the monthly sales trends?",
                                        "Find products with low inventory"
                                    ]).map((example, idx) => (
                                        <Chip
                                            key={idx}
                                            label={example}
                                            onClick={() => setInputQuery(example)}
                                            sx={{
                                                background: 'rgba(102, 126, 234, 0.1)',
                                                color: '#667eea',
                                                border: '1px solid rgba(102, 126, 234, 0.3)',
                                                cursor: 'pointer',
                                                transition: 'all 0.3s ease',
                                                '&:hover': {
                                                    background: '#667eea',
                                                    color: 'white',
                                                    transform: 'translateY(-2px)',
                                                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                                                }
                                            }}
                                        />
                                    ))}
                                </Box>
                            </Box>
                        ) : (
                            <Box>
                                {messages.map(renderMessage)}
                                <div ref={chatEndRef} />
                            </Box>
                        )}
                    </Box>

                    {/* Input Section */}
                    <Box sx={{ 
                        p: 3,
                        background: 'rgba(255, 255, 255, 0.8)',
                        borderTop: '1px solid rgba(102, 126, 234, 0.1)'
                    }}>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                            <TextField
                                fullWidth
                                multiline
                                maxRows={4}
                                value={inputQuery}
                                onChange={(e) => setInputQuery(e.target.value)}
                                placeholder={autoTranslate ? "Ask me anything about your data... (Turkish queries will be automatically translated)" : "Ask me anything about your data..."}
                                disabled={loading || !selectedDatabaseId}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        borderRadius: 3,
                                        background: 'rgba(255, 255, 255, 0.9)',
                                        transition: 'all 0.3s ease',
                                        '& fieldset': {
                                            borderColor: 'rgba(102, 126, 234, 0.3)',
                                        },
                                        '&:hover fieldset': {
                                            borderColor: '#667eea',
                                        },
                                        '&.Mui-focused fieldset': {
                                            borderColor: '#667eea',
                                            borderWidth: 2,
                                        },
                                    },
                                    '& .MuiInputBase-input': {
                                        fontSize: '16px',
                                        color: '#333'
                                    }
                                }}
                            />
                            <Button
                                variant="contained"
                                onClick={sendMessage}
                                disabled={loading || translating || !inputQuery.trim() || !selectedDatabaseId}
                                startIcon={(loading || translating) ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <SendIcon />}
                                sx={{
                                    minWidth: 120,
                                    height: 56,
                                    borderRadius: 3,
                                    background: 'linear-gradient(45deg, #667eea, #764ba2)',
                                    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                                    transition: 'all 0.3s ease',
                                    textTransform: 'none',
                                    fontSize: '16px',
                                    fontWeight: 600,
                                    '&:hover': {
                                        background: 'linear-gradient(45deg, #5a6fd8, #6a4190)',
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 6px 20px rgba(102, 126, 234, 0.5)'
                                    },
                                    '&:disabled': {
                                        background: 'rgba(0, 0, 0, 0.12)',
                                        boxShadow: 'none'
                                    }
                                }}
                            >
                                {translating ? 'Translating...' : loading ? 'Thinking...' : 'Send'}
                            </Button>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Improvements Dialog */}
            <Dialog
                open={improvementsDialog?.open || false}
                onClose={() => setImprovementsDialog(null)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>SQL Improvement Suggestions</DialogTitle>
                <DialogContent>
                    {improvementsDialog?.suggestions && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {improvementsDialog.suggestions.performance_suggestions && (
                                <Box>
                                    <Typography variant="subtitle1" gutterBottom>Performance Optimizations</Typography>
                                    <List dense>
                                        {improvementsDialog.suggestions.performance_suggestions.map((suggestion: string, idx: number) => (
                                            <ListItem key={idx}>
                                                <ListItemIcon>
                                                    <LightbulbIcon color="warning" />
                                                </ListItemIcon>
                                                <ListItemText primary={suggestion} />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Box>
                            )}

                            {improvementsDialog.suggestions.readability_improvements && (
                                <Box>
                                    <Typography variant="subtitle1" gutterBottom>Readability Improvements</Typography>
                                    <List dense>
                                        {improvementsDialog.suggestions.readability_improvements.map((improvement: string, idx: number) => (
                                            <ListItem key={idx}>
                                                <ListItemIcon>
                                                    <CodeIcon color="info" />
                                                </ListItemIcon>
                                                <ListItemText primary={improvement} />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Box>
                            )}

                            {improvementsDialog.suggestions.potential_issues && (
                                <Box>
                                    <Typography variant="subtitle1" gutterBottom>Potential Issues</Typography>
                                    <List dense>
                                        {improvementsDialog.suggestions.potential_issues.map((issue: string, idx: number) => (
                                            <ListItem key={idx}>
                                                <ListItemIcon>
                                                    <HelpIcon color="error" />
                                                </ListItemIcon>
                                                <ListItemText primary={issue} />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Box>
                            )}

                            {improvementsDialog.suggestions.overall_assessment && (
                                <Box>
                                    <Typography variant="subtitle1" gutterBottom>Overall Assessment</Typography>
                                    <Typography variant="body2">
                                        {improvementsDialog.suggestions.overall_assessment}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setImprovementsDialog(null)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Import Dialog */}
            <Dialog
                open={importDialog.open}
                onClose={() => setImportDialog({open: false, sql: '', tableName: ''})}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Execute SQL and Import as Table</DialogTitle>
                <DialogContent>
                    <Typography variant="body1" gutterBottom>
                        Enter a custom name for the table:
                    </Typography>
                    <TextField
                        fullWidth
                        label="Table Name"
                        value={importDialog.tableName}
                        onChange={(e) => setImportDialog({...importDialog, tableName: e.target.value})}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setImportDialog({...importDialog, open: false})}>Cancel</Button>
                    <Button onClick={handleConfirmImport} disabled={!importDialog.tableName}>Confirm</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}; 