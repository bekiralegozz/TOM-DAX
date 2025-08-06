import React, { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    Typography,
    Button,
    Box,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControlLabel,
    Switch,
    CircularProgress,
    Alert,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Chip,
    Divider,
    Tabs,
    Tab,
    Collapse,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    LinearProgress
} from '@mui/material';

import {
    Add as AddIcon,
    Storage as StorageIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    TableChart as TableIcon,
    Schema as SchemaIcon,
    Psychology as AIIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';

import { getUrls } from '../app/utils';
import { useSelector } from 'react-redux';
import { dfSelectors } from '../app/dfSlice';

interface IndexedDatabase {
    database_id: number;
    data_loader_type: string;
    connection_name: string;
    total_tables: number;
    total_schemas: number;
    indexed_at: string;
    status: string;
}

interface DatabaseSchema {
    database_id: number;
    connection_name: string;
    data_loader_type: string;
    total_tables: number;
    total_schemas: number;
    schemas: Array<{
        schema_id: number;
        schema_name: string;
        table_count: number;
        tables: string[];
    }>;
}

interface SearchResult {
    table_id: number;
    table_name: string;
    description: string;
    keywords: string;
    row_count: number;
    column_count: number;
    schema_name: string;
}

interface DatabaseIndexerDialogProps {
    buttonElement: React.ReactNode;
}

export const DatabaseIndexer: React.FC<DatabaseIndexerDialogProps> = ({ buttonElement }) => {
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
                <DialogTitle>Database Indexer</DialogTitle>
                <DialogContent>
                    <DatabaseIndexerContent />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

const DatabaseIndexerContent: React.FC = () => {
    const [indexedDatabases, setIndexedDatabases] = useState<IndexedDatabase[]>([]);
    const [selectedDatabase, setSelectedDatabase] = useState<DatabaseSchema | null>(null);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Dialog states
    const [indexDialogOpen, setIndexDialogOpen] = useState(false);
    const [schemaDialogOpen, setSchemaDialogOpen] = useState(false);
    
    // Form states
    const [connectionName, setConnectionName] = useState('');
    const [dataLoaderType, setDataLoaderType] = useState('mssql');
    const [connectionParams, setConnectionParams] = useState<Record<string, string>>({});
    const [useAIDescriptions, setUseAIDescriptions] = useState(true);
    const [compactIndex, setCompactIndex] = useState(false);
    
    // Use the active model from the global state
    const activeModel = useSelector(dfSelectors.getActiveModel);
    
    // Loading states
    const [loading, setLoading] = useState(false);
    const [indexing, setIndexing] = useState(false);
    const [searching, setSearching] = useState(false);
    
    // Progress states
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [totalTables, setTotalTables] = useState(0);
    const [processedTables, setProcessedTables] = useState(0);
    
    // UI states
    const [expandedSchemas, setExpandedSchemas] = useState<Set<number>>(new Set());
    const [activeTab, setActiveTab] = useState(0);
    const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

    useEffect(() => {
        loadIndexedDatabases();
    }, []);

    const loadIndexedDatabases = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/indexing/list-indexed-databases`);
            const data = await response.json();
            
            if (data.status === 'success') {
                setIndexedDatabases(data.databases);
            } else {
                setMessage({type: 'error', text: data.message || 'Failed to load indexed databases'});
            }
        } catch (error) {
            setMessage({type: 'error', text: 'Failed to load indexed databases'});
        } finally {
            setLoading(false);
        }
    };

    const handleIndexDatabase = async () => {
        setIndexing(true);
        setProgress(0);
        setProgressMessage('Starting database indexing...');
        setTotalTables(0);
        setProcessedTables(0);
        
        try {
            // Start indexing process
            const indexingPromise = fetch(`/api/indexing/index-database`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data_loader_type: dataLoaderType,
                    connection_name: connectionName,
                    connection_params: connectionParams,
                    use_ai_descriptions: useAIDescriptions,
                    model: activeModel,
                    compact: compactIndex
                })
            });
            
            // Start progress polling
            const progressInterval = setInterval(async () => {
                try {
                    const progressResponse = await fetch('/api/indexing/indexing-progress');
                    const progressData = await progressResponse.json();
                    
                    if (progressData.status === 'success') {
                        const prog = progressData.progress;
                        setProgress(prog.progress);
                        setProgressMessage(prog.message);
                        setTotalTables(prog.total_tables);
                        setProcessedTables(prog.processed_tables);
                        
                        // Stop polling when completed or error
                        if (prog.status === 'completed' || prog.status === 'error') {
                            clearInterval(progressInterval);
                        }
                    }
                } catch (error) {
                    console.error('Failed to fetch progress:', error);
                }
            }, 1000); // Poll every second
            
            // Wait for indexing to complete
            const response = await indexingPromise;
            clearInterval(progressInterval);
            
            const data = await response.json();
            
            if (data.status === 'success') {
                setProgress(100);
                setProgressMessage('Database indexing completed successfully!');
                setMessage({
                    type: 'success', 
                    text: `Database indexed successfully! ${data.indexed_tables} tables, ${data.indexed_columns} columns`
                });
                setIndexDialogOpen(false);
                loadIndexedDatabases();
                
                // Reset form
                setConnectionName('');
                setConnectionParams({});
            } else {
                setProgress(0);
                setProgressMessage('Indexing failed');
                setMessage({type: 'error', text: data.message || 'Failed to index database'});
            }
        } catch (error) {
            setProgress(0);
            setProgressMessage('Indexing failed');
            setMessage({type: 'error', text: 'Failed to index database'});
        } finally {
            setIndexing(false);
        }
    };

    const handleViewSchema = async (database: IndexedDatabase) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/indexing/get-database-schema/${database.database_id}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                setSelectedDatabase(data.schema);
                setSchemaDialogOpen(true);
            } else {
                setMessage({type: 'error', text: data.message || 'Failed to load database schema'});
            }
        } catch (error) {
            setMessage({type: 'error', text: 'Failed to load database schema'});
        } finally {
            setLoading(false);
        }
    };

    const handleSearchTables = async (databaseId: number, query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        
        setSearching(true);
        try {
            const response = await fetch(`/api/indexing/search-tables/${databaseId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    limit: 20
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                setSearchResults(data.results);
            } else {
                setMessage({type: 'error', text: data.message || 'Search failed'});
            }
        } catch (error) {
            setMessage({type: 'error', text: 'Search failed'});
        } finally {
            setSearching(false);
        }
    };

    const handleDeleteDatabase = async (databaseId: number) => {
        if (!window.confirm('Are you sure you want to delete this database index?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/indexing/delete-database-index/${databaseId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                setMessage({type: 'success', text: 'Database index deleted successfully'});
                loadIndexedDatabases();
            } else {
                setMessage({type: 'error', text: data.message || 'Failed to delete database index'});
            }
        } catch (error) {
            setMessage({type: 'error', text: 'Failed to delete database index'});
        }
    };

    const toggleSchemaExpansion = (schemaId: number) => {
        const newExpanded = new Set(expandedSchemas);
        if (newExpanded.has(schemaId)) {
            newExpanded.delete(schemaId);
        } else {
            newExpanded.add(schemaId);
        }
        setExpandedSchemas(newExpanded);
    };

    const renderConnectionForm = () => {
        if (dataLoaderType === 'mssql') {
            return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label="Server"
                        value={connectionParams.server || ''}
                        onChange={(e) => setConnectionParams({...connectionParams, server: e.target.value})}
                        required
                        size="small"
                    />
                    <TextField
                        label="Database"
                        value={connectionParams.database || ''}
                        onChange={(e) => setConnectionParams({...connectionParams, database: e.target.value})}
                        required
                        size="small"
                    />
                    <TextField
                        label="Username"
                        value={connectionParams.user || ''}
                        onChange={(e) => setConnectionParams({...connectionParams, user: e.target.value})}
                        required
                        size="small"
                    />
                    <TextField
                        label="Password"
                        type="password"
                        value={connectionParams.password || ''}
                        onChange={(e) => setConnectionParams({...connectionParams, password: e.target.value})}
                        required
                        size="small"
                    />
                    <TextField
                        label="Schema Filter (comma-separated)"
                        value={connectionParams.schema_filter || 'dbo'}
                        onChange={(e) => setConnectionParams({...connectionParams, schema_filter: e.target.value})}
                        placeholder="dbo,sales,marketing"
                        size="small"
                        helperText="Specify which schemas to index"
                    />
                    <TextField
                        label="Table Limit"
                        type="number"
                        value={connectionParams.table_limit || '50'}
                        onChange={(e) => setConnectionParams({...connectionParams, table_limit: e.target.value})}
                        size="small"
                        helperText="Maximum number of tables to index (0 = no limit)"
                    />
                    <TextField
                        label="Table Name Pattern"
                        value={connectionParams.table_name_pattern || ''}
                        onChange={(e) => setConnectionParams({...connectionParams, table_name_pattern: e.target.value})}
                        placeholder="Dim%, %fact%"
                        size="small"
                        helperText="SQL LIKE pattern to filter table names"
                    />
                </Box>
            );
        }
        return null;
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StorageIcon color="primary" />
                    Database Indexer
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setIndexDialogOpen(true)}
                    sx={{ textTransform: 'none' }}
                >
                    Index New Database
                </Button>
            </Box>

            {message && (
                <Alert 
                    severity={message.type} 
                    onClose={() => setMessage(null)}
                    sx={{ mb: 2 }}
                >
                    {message.text}
                </Alert>
            )}

            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Indexed Databases</Typography>
                        <IconButton onClick={loadIndexedDatabases} disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                    </Box>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : indexedDatabases.length === 0 ? (
                        <Typography color="text.secondary" sx={{ textAlign: 'center', p: 3 }}>
                            No databases indexed yet. Click "Index New Database" to get started.
                        </Typography>
                    ) : (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Connection Name</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell align="center">Tables</TableCell>
                                        <TableCell align="center">Schemas</TableCell>
                                        <TableCell>Indexed At</TableCell>
                                        <TableCell align="center">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {indexedDatabases.map((db) => (
                                        <TableRow key={db.database_id}>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {db.connection_name}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={db.data_loader_type.toUpperCase()} 
                                                    size="small" 
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell align="center">{db.total_tables}</TableCell>
                                            <TableCell align="center">{db.total_schemas}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">
                                                    {new Date(db.indexed_at).toLocaleDateString()}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => handleViewSchema(db)}
                                                    sx={{ mr: 1, textTransform: 'none' }}
                                                >
                                                    View Schema
                                                </Button>
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() => handleDeleteDatabase(db.database_id)}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </CardContent>
            </Card>

            {/* Index Database Dialog */}
            <Dialog 
                open={indexDialogOpen} 
                onClose={() => setIndexDialogOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>Index New Database</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <TextField
                            label="Connection Name"
                            value={connectionName}
                            onChange={(e) => setConnectionName(e.target.value)}
                            required
                            size="small"
                            helperText="A friendly name for this database connection"
                        />
                        
                        <FormControl size="small">
                            <InputLabel>Data Loader Type</InputLabel>
                            <Select
                                value={dataLoaderType}
                                onChange={(e) => setDataLoaderType(e.target.value)}
                                label="Data Loader Type"
                            >
                                <MenuItem value="mssql">Microsoft SQL Server</MenuItem>
                                <MenuItem value="mysql">MySQL</MenuItem>
                                <MenuItem value="kusto">Azure Data Explorer (Kusto)</MenuItem>
                            </Select>
                        </FormControl>

                        {renderConnectionForm()}

                        {/* Compact index switch */}
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={compactIndex}
                                    onChange={(e) => setCompactIndex(e.target.checked)}
                                />
                            }
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <StorageIcon fontSize="small" />
                                    Compact Index (no sample data)
                                </Box>
                            }
                        />

                        <Divider sx={{ my: 1 }} />

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={useAIDescriptions}
                                    onChange={(e) => setUseAIDescriptions(e.target.checked)}
                                />
                            }
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AIIcon fontSize="small" />
                                    Generate AI Descriptions
                                </Box>
                            }
                        />

                        {useAIDescriptions && (
                            <Alert severity="info" sx={{ mt: 1 }}>
                                AI descriptions will be generated using the currently selected model: <strong>{activeModel?.model || 'Default'}</strong>
                                <br />
                                You can change the model using the model selector in the main toolbar.
                            </Alert>
                        )}

                        {indexing && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="body2" sx={{ mb: 1 }}>
                                    {progressMessage}
                                </Typography>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={progress} 
                                    sx={{ mb: 1 }}
                                />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {Math.round(progress)}% Complete
                                    </Typography>
                                    {totalTables > 0 && (
                                        <Typography variant="caption" color="text.secondary">
                                            {processedTables} / {totalTables} tables
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIndexDialogOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleIndexDatabase}
                        variant="contained"
                        disabled={indexing || !connectionName || !connectionParams.server}
                        startIcon={indexing ? <CircularProgress size={16} /> : <StorageIcon />}
                    >
                        {indexing ? 'Indexing...' : 'Index Database'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Schema View Dialog */}
            <Dialog 
                open={schemaDialogOpen} 
                onClose={() => setSchemaDialogOpen(false)}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    Database Schema: {selectedDatabase?.connection_name}
                </DialogTitle>
                <DialogContent>
                    {selectedDatabase && (
                        <Box>
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                    {selectedDatabase.total_tables} tables across {selectedDatabase.total_schemas} schemas
                                </Typography>
                            </Box>

                            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
                                <Tab label="Browse Schemas" />
                                <Tab label="Search Tables" />
                            </Tabs>

                            <Box sx={{ mt: 2 }}>
                                {activeTab === 0 && (
                                    <List>
                                        {selectedDatabase.schemas.map((schema) => (
                                            <Box key={schema.schema_id}>
                                                <ListItemButton
                                                    onClick={() => toggleSchemaExpansion(schema.schema_id)}
                                                >
                                                    <ListItemIcon>
                                                        <SchemaIcon />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={schema.schema_name}
                                                        secondary={`${schema.table_count} tables`}
                                                    />
                                                    {expandedSchemas.has(schema.schema_id) ? 
                                                        <ExpandLessIcon /> : <ExpandMoreIcon />}
                                                </ListItemButton>
                                                <Collapse in={expandedSchemas.has(schema.schema_id)}>
                                                    <Box sx={{ pl: 4 }}>
                                                        {schema.tables.map((table) => (
                                                            <ListItem key={table} sx={{ py: 0.5 }}>
                                                                <ListItemIcon>
                                                                    <TableIcon fontSize="small" />
                                                                </ListItemIcon>
                                                                <ListItemText 
                                                                    primary={table}
                                                                    primaryTypographyProps={{ variant: 'body2' }}
                                                                />
                                                            </ListItem>
                                                        ))}
                                                    </Box>
                                                </Collapse>
                                            </Box>
                                        ))}
                                    </List>
                                )}

                                {activeTab === 1 && (
                                    <Box>
                                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                            <TextField
                                                placeholder="Search tables by name, description, or keywords..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                size="small"
                                                fullWidth
                                                InputProps={{
                                                    startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                                                }}
                                            />
                                            <Button
                                                variant="contained"
                                                onClick={() => handleSearchTables(selectedDatabase.database_id, searchQuery)}
                                                disabled={searching}
                                                startIcon={searching ? <CircularProgress size={16} /> : <SearchIcon />}
                                            >
                                                Search
                                            </Button>
                                        </Box>

                                        {searchResults.length > 0 && (
                                            <TableContainer component={Paper} variant="outlined">
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell>Table Name</TableCell>
                                                            <TableCell>Schema</TableCell>
                                                            <TableCell>Description</TableCell>
                                                            <TableCell align="center">Rows</TableCell>
                                                            <TableCell align="center">Columns</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {searchResults.map((result) => (
                                                            <TableRow key={result.table_id}>
                                                                <TableCell>
                                                                    <Typography variant="body2" fontWeight="medium">
                                                                        {result.table_name.split('.').pop()}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Chip 
                                                                        label={result.schema_name} 
                                                                        size="small" 
                                                                        variant="outlined"
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Typography variant="body2" color="text.secondary">
                                                                        {result.description || 'No description'}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell align="center">
                                                                    {result.row_count > 0 ? result.row_count.toLocaleString() : '-'}
                                                                </TableCell>
                                                                <TableCell align="center">{result.column_count}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSchemaDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}; 