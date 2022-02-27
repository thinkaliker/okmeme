import React from 'react';
import { useState, useEffect } from 'react';
import { styled, useTheme, createTheme } from '@mui/material/styles';
import MuiDrawer from '@mui/material/Drawer';
import MuiAppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import Hidden from '@mui/material/Hidden';
import Box from '@mui/material/Box';

import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GradientIcon from '@mui/icons-material/Gradient';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChatIcon from '@mui/icons-material/Chat';
import MovieIcon from '@mui/icons-material/Movie';
import Brightness3Icon from '@mui/icons-material/Brightness3';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import PhotoIcon from '@mui/icons-material/Photo';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';

import SidebarItem from './SidebarItem';
import LoginNavbar from './LoginNavbar';
import LoginSidebar from './LoginSidebar';
import AdminNavbar from './AdminNavbar';
import AdminSidebar from './AdminSidebar';
import SubmitNavbar from './SubmitNavbar';
import SubmitSidebar from './SubmitSidebar';
import RulesSidebar from './RulesSidebar';
import TagSidebar from './TagSidebar';
import LinkList from './LinkList';

import { supabase } from '../utils/initSupabase';

const drawerWidth = 240;

const mediaTypes = {
    'image': {
        name: 'Image',
        icon: <PhotoIcon />
    },
    'video': {
        name: 'Video',
        icon: <MovieIcon />
    },
    'audio': {
        name: 'Audio',
        icon: <AudiotrackIcon />
    },
    'url': {
        name: 'URL',
        icon: <OpenInNewIcon />
    },
    'text': {
        name: 'Text',
        icon: <ChatIcon />
    }
}


const openedMixin = (theme) => ({
    width: drawerWidth,
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
    }),
    overflowX: 'hidden',
});

const closedMixin = (theme) => ({
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    overflowX: 'hidden',
    width: `calc(${theme.spacing(5)} + 1px)`,
    [theme.breakpoints.up('sm')]: {
        width: `calc(${theme.spacing(7)} + 1px)`,
    },
});

const DrawerHeader = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: theme.spacing(0, 1),
    // necessary for content to be below app bar
    ...theme.mixins.toolbar,
}));

const AppBar = styled(MuiAppBar, {
    shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
    zIndex: theme.zIndex.drawer + 1,
    transition: theme.transitions.create(['width', 'margin'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    ...(open && {
        marginLeft: drawerWidth,
        width: `calc(100% - ${drawerWidth}px)`,
        transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
        }),
    }),
}));

const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== 'open' })(
    ({ theme, open }) => ({
        width: drawerWidth,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        ...(open && {
            ...openedMixin(theme),
            '& .MuiDrawer-paper': openedMixin(theme),
        }),
        ...(!open && {
            ...closedMixin(theme),
            '& .MuiDrawer-paper': closedMixin(theme),
        }),
    }),
);
export default function App() {

    // const {classes} = props;

    const [open, setOpen] = React.useState(true);

    const [loggedIn, setLoggedIn] = React.useState(false);

    const theme = useTheme();

    const handleDrawerOpen = () => {
        setOpen(true);
    };

    const handleDrawerClose = () => {
        setOpen(false);
    };

    // console.log(supabase.auth.user())

    useEffect(() => {
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                setLoggedIn(true);
            } else if (event === 'SIGNED_OUT') {
                setLoggedIn(false);
            }
        });
        return () => {
            authListener.unsubscribe()
        }
    });

    // const themeIcon = !theme ? <Brightness7Icon /> : <Brightness3Icon /> 

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar position="fixed" open={open}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        onClick={handleDrawerOpen}
                        edge="start"
                        sx={{
                            marginRight: '36px',
                            ...(open && { display: 'none' }),
                        }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" component="div" sx={{
                        fontWeight: 700,
                        fontStyle: 'italic',
                        color: 'white'
                    }}>
                        OKMEME
                    </Typography>
                </Toolbar>
            </AppBar>
            <Drawer variant="permanent" open={open}>
                <DrawerHeader>
                    <IconButton onClick={handleDrawerClose}>
                        {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                    </IconButton>
                </DrawerHeader>
                <Divider />
                <List>
                    <SidebarItem item={{ name: 'All', icon: <GradientIcon /> }} />
                    {
                        loggedIn ? <AdminSidebar /> : <></>
                    }
                    <RulesSidebar />
                    {
                        loggedIn ? <SubmitSidebar mediaTypes={mediaTypes} /> : <></>
                    }
                    <LoginSidebar supabase={supabase} loggedIn={loggedIn} />
                    <Divider />
                    <TagSidebar />
                </List>

            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
                <LinkList mediaTypes={mediaTypes} supabase={supabase} loggedIn={loggedIn} />
            </Box>
        </Box>
    );
}

// Index.propTypes = {
//   classes: PropTypes.object.isRequired,
// };

// export default Index;
