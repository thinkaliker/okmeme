import React from 'react';
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

import LinkCard from './LinkCard';
import SidebarItem from './SidebarItem';
import LoginNavbar from './LoginNavbar';
import LoginSidebar from './LoginSidebar';
import AdminNavbar from './AdminNavbar';
import AdminSidebar from './AdminSidebar';
import SubmitNavbar from './SubmitNavbar';
import SubmitSidebar from './SubmitSidebar';
import RulesSidebar from './RulesSidebar';
import TagSidebar from './TagSidebar';

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

    const theme = useTheme();

    const handleDrawerOpen = () => {
        setOpen(true);
    };

    const handleDrawerClose = () => {
        setOpen(false);
    };

    console.log(supabase.auth.user())

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
                        supabase.auth.user() ? <AdminSidebar /> : <></>
                    }
                    <RulesSidebar />
                    {
                        supabase.auth.user() ? <SubmitSidebar mediaTypes={mediaTypes} /> : <></>
                    }
                    <LoginSidebar supabase={supabase} />
                    <Divider />
                    <TagSidebar />
                </List>

            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
                <List sx={{ paddingTop: 9 }}>
                    <LinkCard mediaTypes={mediaTypes} mediaType={'text'} saved='12' link='#' timestamp='1553239282400' title='lizard really long text title asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf qwerty qwerty qwerty' tags={['a', 'b', 'c']} author='bob' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'url'} saved='23' link='https://okme.me' timestamp='1553238236670' title='asdf asdf' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'image'} saved='69' media='https://i.redd.it/piutnnjg3en21.png' link='https://i.redd.it/piutnnjg3en21.png' timestamp='1553238236670' title='satiscraftory' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'text'} saved='0' link='#' timestamp='1553238236670' title='asdf sddf' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'image'} saved='42' media='https://i.redd.it/piutnnjg3en21.png' link='https://reddit.com/r/satisfactorygame' timestamp='1553238236670' title='satsifacredditory' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'audio'} saved='42' media='' link='https://soundcloud.com/majorleaguewobs/hamster-dance-trap-remix' timestamp='1551038236670' title='asdf a' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'text'} saved='42' link='#' timestamp='1553238236670' title='asdf' tags={['aas', 'basdf', 'casdf']} author='joe' text='this is self text now boiz aslkdjf ajskfk fskld ajljfklajshfja hjkdfhsfhjks kdsajlf jdskl fjash fjkdhsjkafhajkshfjkdhsjka hfsdjkh fjkasdhfjksdhkaflhsdjklh asjkfh asdjkh fjkash kfjldhskja hfsdjkl hfjkasdh jkl hjkh fjkds ajkh s akljdfklsjkf akfdkl klajfkajfkdjkfjskl akl fklsdjklf askf sdkl jfsdjfklfj sdajfklaj fklsd fklsd flsd klsda fklj' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'video'} saved='42' link='https://www.youtube.com/watch?v=RM4IjR3DtrQ' timestamp='1553238236670' title='asdfaaasss' tags={['aas', 'basdf', 'casdf']} author='joe' />
                </List>

            </Box>
        </Box>
    );
}

// Index.propTypes = {
//   classes: PropTypes.object.isRequired,
// };

// export default Index;
