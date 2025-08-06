// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import React, { FC, useEffect, useState } from 'react';
import '../scss/App.scss';

import { useDispatch, useSelector } from "react-redux";
import {
    DataFormulatorState,
    dfActions,
    fetchAvailableModels,
    fetchFieldSemanticType,
    getSessionId,
} from './dfSlice'

import { red, purple, blue, brown, yellow, orange, } from '@mui/material/colors';

import _ from 'lodash';

import {
    Button,
    Tooltip,
    Typography,
    Box,
    Toolbar,
    Input,
    Divider,
    DialogTitle,
    Dialog,
    DialogContent,
    Avatar,
    Link,
    DialogContentText,
    DialogActions,
    ToggleButtonGroup,
    ToggleButton,
    Menu,
    MenuItem,
    TextField,
    CircularProgress,
} from '@mui/material';


import MuiAppBar from '@mui/material/AppBar';
import { createTheme, styled, ThemeProvider } from '@mui/material/styles';

import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import ClearIcon from '@mui/icons-material/Clear';

import { DataFormulatorFC } from '../views/DataFormulator';

import GridViewIcon from '@mui/icons-material/GridView';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import SettingsIcon from '@mui/icons-material/Settings';
import {
    createBrowserRouter,
    RouterProvider,
} from "react-router-dom";
import { About } from '../views/About';
import { MessageSnackbar } from '../views/MessageSnackbar';
import { appConfig, assignAppConfig, PopupConfig } from './utils';
import { DictTable } from '../components/ComponentType';
import { AppDispatch } from './store';
import { ActionSubscription, subscribe, unsubscribe } from './embed';
import dfLogo from '../assets/df-logo.png';
import { Popup } from '../components/Popup';
import { ModelSelectionButton } from '../views/ModelSelectionDialog';
import { TableCopyDialogV2 } from '../views/TableSelectionView';
import { TableUploadDialog } from '../views/TableSelectionView';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import { DBTableManager, DBTableSelectionDialog, handleDBDownload } from '../views/DBTableManager';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import { DatabaseIndexer } from '../components/DatabaseIndexer';
import { NLPChat } from '../components/NLPChat';
import StorageIcon from '@mui/icons-material/Storage';
import ChatIcon from '@mui/icons-material/Chat';

// Authentication imports
import { useAuth } from '../hooks/useAuth';
import { Login } from '../components/Login';

const AppBar = styled(MuiAppBar)(({ theme }) => ({
    background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(249,250,255,0.95) 100%)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(102, 126, 234, 0.15)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
    color: '#2c3e50',
    position: 'relative',
    '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(90deg, rgba(102, 126, 234, 0.03) 0%, rgba(118, 75, 162, 0.03) 100%)',
        pointerEvents: 'none',
    },
    transition: theme.transitions.create(['margin', 'width', 'box-shadow'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    '&:hover': {
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.12)',
    }
}));

declare module '@mui/material/styles' {
    interface Palette {
        derived: Palette['primary'];
        custom: Palette['primary'];
    }
    interface PaletteOptions {
        derived: PaletteOptions['primary'];
        custom: PaletteOptions['primary'];
    }
}

export const ImportStateButton: React.FC<{}> = ({ }) => {
    const dispatch = useDispatch();
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const files = event.target.files;
        if (files) {
            for (let file of files) {
                file.text().then((text) => {
                    try {
                        let savedState = JSON.parse(text);
                        dispatch(dfActions.loadState(savedState));
                    } catch (error) {
                        console.error('Failed to parse state file:', error);
                    }
                });
            }
        }
        // Reset the input value to allow uploading the same file again
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    return (
        <Button 
            variant="text" 
            color="primary"
            sx={{textTransform: 'none'}}
            onClick={() => inputRef.current?.click()}
            startIcon={<UploadFileIcon />}
        >
            <Input 
                inputProps={{ 
                    accept: '.json, .dfstate',
                    multiple: false 
                }}
                id="upload-data-file"
                type="file"
                sx={{ display: 'none' }}
                inputRef={inputRef}
                onChange={handleFileUpload}
            />
            import a saved session
        </Button>
    );
}

export const ExportStateButton: React.FC<{}> = ({ }) => {
    const sessionId = useSelector((state: DataFormulatorState) => state.sessionId);
    const fullStateJson = useSelector((state: DataFormulatorState) => JSON.stringify(state));

    return <Tooltip title="save session locally">
        <Button 
            variant="text" 
            sx={{textTransform: 'none'}} 
            onClick={() => {
                function download(content: string, fileName: string, contentType: string) {
                    let a = document.createElement("a");
                    let file = new Blob([content], { type: contentType });
                    a.href = URL.createObjectURL(file);
                    a.download = fileName;
                    a.click();
                }
                download(fullStateJson, `df_state_${sessionId?.slice(0, 4)}.json`, 'text/plain');
            }}
            startIcon={<DownloadIcon />}
        >
            export session
        </Button>
    </Tooltip>
}


//type AppProps = ConnectedProps<typeof connector>;

export const toolName = "DAX"

export interface AppFCProps {
}

// Extract menu components into separate components to prevent full app re-renders
const TableMenu: React.FC = () => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    
    return (
        <>
            <Button
                variant="text"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                endIcon={<KeyboardArrowDownIcon />}
                aria-controls={open ? 'add-table-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={open ? 'true' : undefined}
                sx={{ textTransform: 'none' }}
            >
                Add Table
            </Button>
            <Menu
                id="add-table-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={() => setAnchorEl(null)}
                MenuListProps={{
                    'aria-labelledby': 'add-table-button',
                    sx: { py: '4px', px: '8px' }
                }}
                sx={{ '& .MuiMenuItem-root': { padding: 0, margin: 0 } }}
            >
                <MenuItem onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}>
                    <TableCopyDialogV2 buttonElement={
                        <Typography sx={{ fontSize: 14, textTransform: 'none', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ContentPasteIcon fontSize="small" />
                            from clipboard
                        </Typography>
                    } disabled={false} />
                </MenuItem>
                <MenuItem onClick={(e) => {}} >
                    <TableUploadDialog buttonElement={
                        <Typography sx={{ fontSize: 14, textTransform: 'none', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <UploadFileIcon fontSize="small" />
                            from file
                        </Typography>
                    } disabled={false} />
                </MenuItem>
            </Menu>
        </>
    );
};

const SessionMenu: React.FC = () => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const sessionId = useSelector((state: DataFormulatorState) => state.sessionId);
    
    return (
        <>
            <Button 
                variant="text" 
                onClick={(e) => setAnchorEl(e.currentTarget)} 
                endIcon={<KeyboardArrowDownIcon />} 
                sx={{ textTransform: 'none' }}
            >
                Session {sessionId ? `(${sessionId.substring(0, 8)}...)` : ''}
            </Button>
            <Menu
                id="session-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={() => setAnchorEl(null)}
                MenuListProps={{
                    'aria-labelledby': 'session-menu-button',
                    sx: { py: '4px', px: '8px' }
                }}
                sx={{ '& .MuiMenuItem-root': { padding: 0, margin: 0 } }}
            >
                {sessionId && (
                    <MenuItem disabled>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', mx: 2 }}>
                            ID: {sessionId}
                        </Typography>
                    </MenuItem>
                )}
                <MenuItem onClick={() => {}}>
                    <ExportStateButton />
                </MenuItem>
                <MenuItem onClick={() => {
                    handleDBDownload(sessionId ?? '');
                }}>
                    <Button startIcon={<DownloadIcon />} sx={{ fontSize: 14, textTransform: 'none', display: 'flex', alignItems: 'center'}}>
                        download database
                    </Button>
                </MenuItem>
                <MenuItem onClick={(e) => {}}>
                    <ImportStateButton />
                </MenuItem>
            </Menu>
        </>
    );
};

const ResetDialog: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const [open, setOpen] = useState(false);

    const handleReset = () => {
        dispatch(dfActions.resetState());
        setOpen(false);
    };

    return (
        <>
            <Button 
                variant="text" 
                onClick={() => setOpen(true)} 
                sx={{ textTransform: 'none' }}
                color="error"
                startIcon={<ClearIcon />}
            >
                Reset
            </Button>
            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>Reset Session</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to reset the current session? This will clear all data and charts.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleReset} color="error" autoFocus>
                        Reset
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

const LogoutButton: React.FC = () => {
    const { logout, user } = useAuth();
    
    const handleLogout = async () => {
        await logout();
    };

    return (
        <Tooltip title={`Logged in as ${user?.username || 'User'} - Click to logout`}>
            <Button
                variant="text"
                onClick={handleLogout}
                sx={{ 
                    textTransform: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    padding: '6px 12px',
                    borderRadius: '12px',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                    }
                }}
                color="inherit"
            >
                <Avatar 
                    {...stringAvatar(user?.username || 'User')}
                    sx={{
                        width: 24,
                        height: 24,
                        fontSize: '0.75rem',
                        background: 'linear-gradient(45deg, #667eea, #764ba2)',
                        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
                        border: '2px solid rgba(255, 255, 255, 0.8)'
                    }}
                />
                <PowerSettingsNewIcon sx={{ fontSize: 16 }} />
            </Button>
        </Tooltip>
    );
};

const ConfigDialog: React.FC = () => {
    const [open, setOpen] = useState(false);
    const dispatch = useDispatch();
    const config = useSelector((state: DataFormulatorState) => state.config);


    const [formulateTimeoutSeconds, setFormulateTimeoutSeconds] = useState(config.formulateTimeoutSeconds);
    const [maxRepairAttempts, setMaxRepairAttempts] = useState(config.maxRepairAttempts);

    const [defaultChartWidth, setDefaultChartWidth] = useState(config.defaultChartWidth);
    const [defaultChartHeight, setDefaultChartHeight] = useState(config.defaultChartHeight);

    // Add check for changes
    const hasChanges = formulateTimeoutSeconds !== config.formulateTimeoutSeconds || 
                      maxRepairAttempts !== config.maxRepairAttempts ||
                      defaultChartWidth !== config.defaultChartWidth ||
                      defaultChartHeight !== config.defaultChartHeight;

    return (
        <>
            <Button variant="text" sx={{textTransform: 'none'}} onClick={() => setOpen(true)} startIcon={<SettingsIcon />}>
                 <Box component="span" sx={{lineHeight: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'left'}}>
                    <Box component="span" sx={{py: 0, my: 0, fontSize: '10px', mr: 'auto'}}>default_timeout={config.formulateTimeoutSeconds}s</Box>
                    <Box component="span" sx={{py: 0, my: 0, fontSize: '10px', mr: 'auto'}}>chart_size={config.defaultChartWidth}x{config.defaultChartHeight}</Box>
                </Box>
            </Button>
            <Dialog onClose={() => setOpen(false)} open={open}>
                <DialogTitle>DAX Configuration</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        <Box sx={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 3,
                            maxWidth: 400
                        }}>
                            <Divider><Typography variant="caption">Frontend configuration</Typography></Divider>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ flex: 1 }}>
                                    <TextField
                                        label="default chart width"
                                        type="number"
                                        variant="outlined"
                                        value={defaultChartWidth}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value);
                                            setDefaultChartWidth(value);
                                        }}
                                        fullWidth
                                        inputProps={{
                                            min: 100,
                                            max: 1000
                                        }}
                                        error={defaultChartWidth < 100 || defaultChartWidth > 1000}
                                        helperText={defaultChartWidth < 100 || defaultChartWidth > 1000 ? 
                                            "Value must be between 100 and 1000 pixels" : ""}
                                    />
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    <ClearIcon fontSize="small" />
                                </Typography>
                                <Box sx={{ flex: 1 }}>
                                    <TextField
                                        label="default chart height"
                                        type="number"
                                        variant="outlined"
                                        value={defaultChartHeight}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value);
                                            setDefaultChartHeight(value);
                                        }}
                                        fullWidth
                                        inputProps={{
                                            min: 100,
                                            max: 1000
                                        }}
                                        error={defaultChartHeight < 100 || defaultChartHeight > 1000}
                                        helperText={defaultChartHeight < 100 || defaultChartHeight > 1000 ? 
                                            "Value must be between 100 and 1000 pixels" : ""}
                                    />
                                </Box>
                            </Box>
                            <Divider><Typography variant="caption">Backend configuration</Typography></Divider>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ flex: 1 }}>
                                    <TextField
                                        label="formulate timeout (seconds)"
                                        type="number"
                                        variant="outlined"
                                        value={formulateTimeoutSeconds}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value);
                                            setFormulateTimeoutSeconds(value);
                                        }}
                                        inputProps={{
                                            min: 0,
                                            max: 3600,
                                        }}
                                        error={formulateTimeoutSeconds <= 0 || formulateTimeoutSeconds > 3600}
                                        helperText={formulateTimeoutSeconds <= 0 || formulateTimeoutSeconds > 3600 ? 
                                            "Value must be between 1 and 3600 seconds" : ""}
                                        fullWidth
                                    />
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                        Maximum time allowed for the formulation process before timing out. 
                                    </Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ flex: 1 }}>
                                    <TextField
                                        label="max repair attempts"
                                        type="number"
                                        variant="outlined"
                                        value={maxRepairAttempts}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value);
                                            setMaxRepairAttempts(value);
                                        }}
                                        fullWidth
                                        inputProps={{
                                            min: 1,
                                            max: 5,
                                        }}
                                        error={maxRepairAttempts <= 0 || maxRepairAttempts > 5}
                                        helperText={maxRepairAttempts <= 0 || maxRepairAttempts > 5 ? 
                                            "Value must be between 1 and 5" : ""}
                                    />
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                        Maximum number of times the LLM will attempt to repair code if generated code fails to execute (recommended = 1).
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                        Higher values might slightly increase the chance of success but can crash the backend. Repair time is as part of the formulate timeout.
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{'.MuiButton-root': {textTransform: 'none'}}}>
                    <Button sx={{marginRight: 'auto'}} onClick={() => {
                        setFormulateTimeoutSeconds(30);
                        setMaxRepairAttempts(1);
                        setDefaultChartWidth(300);
                        setDefaultChartHeight(300);
                    }}>Reset to default</Button>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button 
                        variant={hasChanges ? "contained" : "text"}
                        disabled={!hasChanges || isNaN(maxRepairAttempts) || maxRepairAttempts <= 0 || maxRepairAttempts > 5 
                            || isNaN(formulateTimeoutSeconds) || formulateTimeoutSeconds <= 0 || formulateTimeoutSeconds > 3600
                            || isNaN(defaultChartWidth) || defaultChartWidth <= 0 || defaultChartWidth > 1000
                            || isNaN(defaultChartHeight) || defaultChartHeight <= 0 || defaultChartHeight > 1000}
                        onClick={() => {
                            dispatch(dfActions.setConfig({formulateTimeoutSeconds, maxRepairAttempts, defaultChartWidth, defaultChartHeight}));
                            setOpen(false);
                        }}
                    >
                        Apply
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );  
}

export const AppFC: FC<AppFCProps> = function AppFC(appProps) {

    const visViewMode = useSelector((state: DataFormulatorState) => state.visViewMode);
    const config = useSelector((state: DataFormulatorState) => state.config);
    const tables = useSelector((state: DataFormulatorState) => state.tables);
    const sessionId = useSelector((state: DataFormulatorState) => state.sessionId);

    // Authentication
    const { user, isAuthenticated, isLoading, login, logout } = useAuth();

    // if the user has logged in
    const [userInfo, setUserInfo] = useState<{ name: string, userId: string } | undefined>(undefined);

    const [popupConfig, setPopupConfig] = useState<PopupConfig>({});

    const dispatch = useDispatch<AppDispatch>();

    useEffect(() => {
        const subscription: ActionSubscription = {
            loadData: (table: DictTable) => {
                dispatch(dfActions.loadTable(table));
                dispatch(fetchFieldSemanticType(table));
            },
            setAppConfig: (config) => {
                assignAppConfig(config);
                config.popupConfig && setPopupConfig(config.popupConfig);
            },
        };
        subscribe(subscription);
        return () => {
            unsubscribe(subscription);
        };
    }, []);

    useEffect(() => {
        // Only proceed with initialization if authenticated
        if (isAuthenticated) {
        document.title = toolName;
        dispatch(fetchAvailableModels());
        dispatch(getSessionId());
        }
    }, [isAuthenticated]);

    // Show loading spinner while checking authentication
    if (isLoading) {
        return (
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            }}>
                <CircularProgress size={60} sx={{ color: 'white' }} />
            </Box>
        );
    }

    // Show login page if not authenticated
    if (!isAuthenticated) {
        return <Login onLoginSuccess={login} />;
    }

    let theme = createTheme({
        typography: {
            fontFamily: [
                "Arial",
                "Roboto",
                "Helvetica Neue",
                "sans-serif"
            ].join(",")
        },
        palette: {
            primary: {
                main: blue[700]
            },
            secondary: {
                main: purple[700]
            },
            derived: {
                main: yellow[700], 
            },
            custom: {
                main: orange[700], //lightsalmon
            },
            warning: {
                main: '#bf5600', // New accessible color, original (#ed6c02) has insufficient color contrast of 3.11
            },
        },
    });

    let appBar = [
        <AppBar className="app-bar" position="static" key="app-bar-main">
            <Toolbar variant="dense" sx={{ 
                minHeight: '48px', 
                padding: '0 16px',
                position: 'relative',
                zIndex: 1
            }}>
                {/* Logo and Brand Section */}
                <Button href={"/"} sx={{
                    display: "flex", 
                    flexDirection: "row", 
                    textTransform: "none",
                    backgroundColor: 'transparent',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    marginRight: '12px',
                    transition: 'all 0.3s ease',
                    "&:hover": {
                        backgroundColor: "rgba(102, 126, 234, 0.08)",
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.15)'
                    }
                }} color="inherit">
                    <Box 
                        component="img" 
                        sx={{ 
                            height: 28, 
                            marginRight: "12px",
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))',
                                transform: 'scale(1.05)'
                            }
                        }} 
                        alt="" 
                        src={dfLogo} 
                    />
                    <Typography 
                        variant="h6" 
                        noWrap 
                        component="h1" 
                        className="gradient-text"
                        sx={{ 
                            fontWeight: 600, 
                            display: { xs: 'none', sm: 'block' },
                            fontSize: '1.1rem',
                            letterSpacing: '0.3px'
                        }}
                    >
                        {toolName} {process.env.NODE_ENV == "development" ? "DEV" : ""}
                    </Typography>
                </Button>

                {/* Center Section - View Switchers */}
                <Box sx={{ 
                    flexGrow: 1, 
                    display: 'flex', 
                    justifyContent: 'center',
                    alignItems: 'center'
                }}>
                    <Box sx={{ 
                        background: 'rgba(255, 255, 255, 0.7)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: '12px',
                        padding: '4px',
                        border: '1px solid rgba(102, 126, 234, 0.2)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
                    }}>
            <ToggleButtonGroup
                color="primary"
                value={visViewMode}
                exclusive
                size="small"
                onChange={(
                    event: React.MouseEvent<HTMLElement>,
                    newViewMode: string | null,
                ) => {
                                if (newViewMode === "gallery" || newViewMode === "carousel" || newViewMode === "chat") {
                        dispatch(dfActions.setVisViewMode(newViewMode));
                    }
                }}
                aria-label="View Mode"
                            sx={{ 
                                "& .MuiToggleButton-root": { 
                                    padding: "6px 10px",
                                    border: 'none',
                                    borderRadius: '6px',
                                    margin: '2px',
                                    color: '#667eea',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                                        transform: 'scale(1.05)'
                                    },
                                    '&.Mui-selected': {
                                        backgroundColor: '#667eea',
                                        color: 'white',
                                        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
                                        '&:hover': {
                                            backgroundColor: '#5a6fd8'
                                        }
                                    }
                                }
                            }}
            >
                <ToggleButton value="carousel" aria-label="view list">
                                <Tooltip title="List View">
                        <ViewSidebarIcon fontSize="small" sx={{ transform: "scaleX(-1)" }} />
                    </Tooltip>
                </ToggleButton>
                <ToggleButton value="gallery" aria-label="view grid">
                                <Tooltip title="Grid View">
                        <GridViewIcon fontSize="small" />
                    </Tooltip>
                </ToggleButton>
                            <ToggleButton value="chat" aria-label="chat view">
                                <Tooltip title="Chat View">
                                    <ChatIcon fontSize="small" />
                                </Tooltip>
                            </ToggleButton>
            </ToggleButtonGroup>
        </Box>
                </Box>

                {/* Right Section - Action Buttons */}
                <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    gap: 0.5,
                    '& .MuiDivider-root': {
                        borderColor: 'rgba(102, 126, 234, 0.2)',
                        height: '20px',
                        margin: '0 4px'
                    }
                }}>
                    <ConfigDialog />
                    <Divider orientation="vertical" variant="middle" flexItem />
                    <DBTableSelectionDialog buttonElement={
                        <Typography sx={{ 
                            display: 'flex', 
                            fontSize: 13, 
                            alignItems: 'center', 
                            gap: 1, 
                            textTransform: 'none',
                            color: '#2c3e50',
                            fontWeight: 500,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                backgroundColor: 'rgba(102, 126, 234, 0.08)',
                                color: '#667eea'
                            }
                        }}>
                            <CloudQueueIcon fontSize="small" /> Database
                        </Typography>
                    } />
                    <Divider orientation="vertical" variant="middle" flexItem />
                    <DatabaseIndexer buttonElement={
                        <Typography sx={{ 
                            display: 'flex', 
                            fontSize: 13, 
                            alignItems: 'center', 
                            gap: 1, 
                            textTransform: 'none',
                            color: '#2c3e50',
                            fontWeight: 500,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                backgroundColor: 'rgba(102, 126, 234, 0.08)',
                                color: '#667eea'
                            }
                        }}>
                            <StorageIcon fontSize="small" /> Indexer
                        </Typography>
                    } />
                    <Divider orientation="vertical" variant="middle" flexItem />
                    <NLPChat buttonElement={
                        <Typography sx={{ 
                            display: 'flex', 
                            fontSize: 13, 
                            alignItems: 'center', 
                            gap: 1, 
                            textTransform: 'none',
                            color: '#2c3e50',
                            fontWeight: 500,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                backgroundColor: 'rgba(102, 126, 234, 0.08)',
                                color: '#667eea'
                            }
                        }}>
                            <ChatIcon fontSize="small" /> Chat
                        </Typography>
                    } />
                    <Divider orientation="vertical" variant="middle" flexItem />
                    <Box sx={{
                        '& button': {
                            color: '#2c3e50',
                            fontWeight: 500,
                            textTransform: 'none',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                backgroundColor: 'rgba(102, 126, 234, 0.08)',
                                color: '#667eea'
                            }
                        }
                    }}>
                    <ModelSelectionButton />
                    </Box>
                    <Divider orientation="vertical" variant="middle" flexItem />
                    <Typography sx={{ 
                        display: 'flex', 
                        fontSize: 13, 
                        alignItems: 'center', 
                        gap: 1,
                        '& button': {
                            color: '#2c3e50',
                            fontWeight: 500,
                            textTransform: 'none',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                backgroundColor: 'rgba(102, 126, 234, 0.08)',
                                color: '#667eea'
                            }
                        }
                    }}>
                        <TableMenu />
                    </Typography>
                    <Divider orientation="vertical" variant="middle" flexItem />
                    <Typography sx={{ 
                        display: 'flex', 
                        fontSize: 13, 
                        alignItems: 'center', 
                        gap: 1,
                        '& button': {
                            color: '#2c3e50',
                            fontWeight: 500,
                            textTransform: 'none',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                backgroundColor: 'rgba(102, 126, 234, 0.08)',
                                color: '#667eea'
                            }
                        }
                    }}>
                        <SessionMenu />
                    </Typography>
                    <Divider orientation="vertical" variant="middle" flexItem />
                    <Box sx={{
                        '& button': {
                            color: '#2c3e50',
                            fontWeight: 500,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                color: '#ef4444'
                            }
                        }
                    }}>
                    <ResetDialog />
                    </Box>
                    <Box sx={{
                        '& button': {
                            color: '#2c3e50',
                            fontWeight: 500,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                color: '#ef4444'
                            }
                        }
                    }}>
                        <LogoutButton />
                    </Box>
                    <Popup popupConfig={popupConfig} appConfig={appConfig} table={tables[0]} />
                </Box>
            </Toolbar>
        </AppBar>
    ];

    let router = createBrowserRouter([
        {
            path: "/about",
            element: <About />,
        }, {
            path: "/test",
            element: <DBTableManager />,
        }, {
            path: "*",
            element: <DataFormulatorFC />,
            errorElement: <Box sx={{ width: "100%", height: "100%", display: "flex" }}>
                <Typography color="gray" sx={{ margin: "150px auto" }}>An error has occurred, please <Link href="/">refresh the session</Link>. If the problem still exists, click close session.</Typography>
            </Box>
        }
    ]);

    let app =
        <Box sx={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            '& > *': {
                minWidth: '1000px',
                minHeight: '800px'
            }
        }}>
            <Box sx={{ 
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                overflow: 'hidden'
            }}>
                {appBar}
                <RouterProvider router={router} />
                <MessageSnackbar />
            </Box>
        </Box>;

    return (
        <ThemeProvider theme={theme}>
            {app}
        </ThemeProvider>
    );
}

function stringAvatar(name: string) {
    let displayName = ""
    try {
        let nameSplit = name.split(' ')
        displayName = `${nameSplit[0][0]}${nameSplit.length > 1 ? nameSplit[nameSplit.length - 1][0] : ''}`
    } catch {
        displayName = name ? name[0] : "?";
    }
    return {
        sx: {
            bgcolor: "cornflowerblue",
            width: 36,
            height: 36,
            margin: "auto",
            fontSize: "1rem"
        },
        children: displayName,
    };
}
