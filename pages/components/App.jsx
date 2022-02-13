import React from 'react';
import { styled, useTheme, createTheme } from '@mui/material/styles';
import MuiDrawer from '@mui/material/Drawer';
import MuiAppBar from '@mui/material/AppBar';
import CssBaseline from '@mui/material/CssBaseline';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Hidden from '@mui/material/Hidden';
import Box from '@mui/material/Box';

import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import InputIcon from '@mui/icons-material/Input';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MovieIcon from '@mui/icons-material/Movie';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import VideogameAsset from '@mui/icons-material/VideogameAsset';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DevicesIcon from '@mui/icons-material/Devices';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CakeIcon from '@mui/icons-material/Cake';
import GradientIcon from '@mui/icons-material/Gradient';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PlaceIcon from '@mui/icons-material/Place';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import AddBoxIcon from '@mui/icons-material/AddBox';
import FastfoodIcon from '@mui/icons-material/Fastfood';
import PhotoIcon from '@mui/icons-material/Photo';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChatIcon from '@mui/icons-material/Chat';
import SecurityIcon from '@mui/icons-material/Security';
import InboxIcon from '@mui/icons-material/MoveToInbox';
import MailIcon from '@mui/icons-material/Mail';
import Brightness3Icon from '@mui/icons-material/Brightness3';
import Brightness7Icon from '@mui/icons-material/Brightness7';

import LinkCard from './LinkCard';
import SidebarItem from './SidebarItem';
import LoginNavbar from './LoginNavbar';
import LoginSidebar from './LoginSidebar';
import AdminNavbar from './AdminNavbar';
import AdminSidebar from './AdminSidebar';
import SubmitNavbar from './SubmitNavbar';
import SubmitSidebar from './SubmitSidebar';
import { cardActionAreaClasses } from '@mui/material';

const drawerWidth = 240;

// const styles = {
//   root: {
//     display: 'flex',
//   },
//   appBar: {
//     zIndex: theme.zIndex.drawer + 1,
//     transition: theme.transitions.create(['width', 'margin'], {
//       easing: theme.transitions.easing.sharp,
//       duration: theme.transitions.duration.leavingScreen,
//     }),
//   },
//   appBarShift: {
//     marginLeft: drawerWidth,
//     width: `calc(100% - ${drawerWidth}px)`,
//     transition: theme.transitions.create(['width', 'margin'], {
//       easing: theme.transitions.easing.sharp,
//       duration: theme.transitions.duration.enteringScreen,
//     }),
//   },
//   menuButton: {
//     marginLeft: 12,
//     marginRight: 20,
//     color: 'white',
//   },
//   drawer: {
//     width: drawerWidth,
//     flexShrink: 0,
//     display: 'flex',
//     flexGrow: 1,
//     paddingTop: 64,
//   },
//   drawerPaper: {
//     width: drawerWidth,
//     position: 'unset',
//   },
//   drawerOpen: {
//     width: drawerWidth,
//     transition: theme.transitions.create('width', {
//       easing: theme.transitions.easing.sharp,
//       duration: theme.transitions.duration.enteringScreen,
//     }),
//     overflowX: 'hidden',
//   },
//   drawerClose: {
//     transition: theme.transitions.create('width', {
//       easing: theme.transitions.easing.sharp,
//       duration: theme.transitions.duration.leavingScreen,
//     }),
//     overflowX: 'hidden',
//     width: theme.spacing(7) + 1,
//     [theme.breakpoints.up('sm')]: {
//       width: theme.spacing(9) + 1,
//     },
//   },
//   barTitle: {

//   },
//   content: {
//     display: 'flex',
//     flex: '1 1 100%',
//     paddingTop: 64,
//   },
//   toolbar: {
//     display: 'flex',
//     padding: '0 8px',
//     ...theme.mixins.toolbar
//   },
//   logo: {
//     width: drawerWidth,
//   },
//   grow: {
//     flexGrow: 1,
//   },
//   icons: {
//     marginRight: 0
//   },
//   paper: {
//     margin: theme.spacing(2),
//     display: 'flex',
//   },
//   fab: {
//     position: 'absolute',
//     bottom: theme.spacing(2),
//     right: theme.spacing(2),
//   },
//   label: {
//     paddingLeft: 10,
//   },
//   cardList: {
//     flex: '0 0 100%',
//     backgroundColor: theme.palette.background.default,
//   },
//   card: {
//     flex: '0 0 100%',
//     margin: 5,
//   },
//   hide: {
//     display: 'none'
//   },
//   listItem: {
//     display: 'flex',
//     alignItems: 'center',
//     paddingLeft: 24
//   },
//   listItemLabel: {
//     fontWeight: 500,
//   },
//   nested: {
//     paddingLeft: theme.spacing(4)
//   },
//   link: {
//     color: 'inherit',
//     textDecoration: 'none',
//   },
//   linkPreview: {
//     color: theme.palette.text.secondary,
//   },
//   navbarButton: {
//     color: 'white',
//     paddingRight: 10,
//     marginRight: 10,
//   },
//   mediaPreview: {
//     height: 100
//   },
//   mediaFull: {
//     width: `calc(100% - ${drawerWidth})`,
//     maxWidth: `calc(100% - ${drawerWidth} - 30)`,
//     height: '100%',
//     maxHeight: '100%',
//   },
//   selector: {
//     '& .MuiSelect-root': {
//       flex: 1,
//       alignItems: 'left'
//     }
//   },
//   list: {
//     minWidth: 500,
//   },
// }

const categoryTypes = {
    'all': {
        name: 'All',
        icon: <GradientIcon />
    },
    'music': {
        name: 'Music',
        icon: <MusicNoteIcon />
    },
    'videos': {
        name: 'Videos',
        icon: <MovieIcon />
    },
    'images': {
        name: 'Images',
        icon: <CameraAltIcon />
    },
    'games': {
        name: 'Games',
        icon: <VideogameAsset />
    },
    'code': {
        name: 'Code',
        icon: <KeyboardIcon />
    },
    'tech': {
        name: 'Tech',
        icon: <DevicesIcon />
    },
    'cars': {
        name: 'Cars',
        icon: <DirectionsCarIcon />
    },
    'outside': {
        name: 'Outside',
        icon: <PlaceIcon />
    },
    'shopping': {
        name: 'Shopping',
        icon: <ShoppingCartIcon />
    },
    'food': {
        name: 'Food',
        icon: <FastfoodIcon />
    },
    'memes': {
        name: 'Memes',
        icon: <CakeIcon />
    },
}

const extraButtons = {
    'submit': {
        name: 'Submit',
        icon: <AddBoxIcon />
    },
    'login': {
        name: 'Login',
        icon: <InputIcon />
    },
    'admin': {
        name: 'Admin',
        icon: <SecurityIcon />
    }
}

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
                    <SidebarItem item={categoryTypes['all']} />
                    <AdminSidebar extraButtons={extraButtons} />
                    <SubmitSidebar mediaTypes={mediaTypes} extraButtons={extraButtons} />
                    <LoginSidebar extraButtons={extraButtons} />
                    <Divider />
                    <SidebarItem item={categoryTypes['music']} tags={['Electronic', 'Chill', 'Classical', 'Rock']} />
                    <SidebarItem item={categoryTypes['videos']} tags={['YouTube', 'GFY', 'Other']} />
                    <SidebarItem item={categoryTypes['images']} tags={['Imgur', 'Art', 'Instagram']} />
                    <SidebarItem item={categoryTypes['games']} tags={['PC', 'XBOX', 'PlayStation', 'Nintendo', 'Mobile']} />
                    <SidebarItem item={categoryTypes['code']} tags={['Web', 'Python', 'Games']} />
                    <SidebarItem item={categoryTypes['tech']} tags={['Computers', 'Phones', 'Gadgets', 'Wearables']} />
                    <SidebarItem item={categoryTypes['cars']} tags={['Four Wheels', 'Two Wheels']} />
                    <SidebarItem item={categoryTypes['outside']} tags={['Camp', 'Hike', 'Run']} />
                    <SidebarItem item={categoryTypes['shopping']} tags={['Deals', 'Parts']} />
                    <SidebarItem item={categoryTypes['food']} tags={['Recipes', 'Videos']} />
                    <SidebarItem item={categoryTypes['memes']} tags={['.jpg', '.gif', '.mp4']} />
                </List>

            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
                <List sx={{ paddingTop: 9 }}>
                    <LinkCard mediaTypes={mediaTypes} mediaType={'text'} points='12' link='#' timestamp='1553239282400' title='lizard really long text title asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf qwerty qwerty qwerty' tags={['a', 'b', 'c']} author='bob' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'url'} points='23' link='https://okme.me' timestamp='1553238236670' title='asdf asdf' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'image'} points='69' media='https://i.redd.it/piutnnjg3en21.png' link='https://i.redd.it/piutnnjg3en21.png' timestamp='1553238236670' title='satiscraftory' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'text'} points='0' link='#' timestamp='1553238236670' title='asdf sddf' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'image'} points='42' media='https://i.redd.it/piutnnjg3en21.png' link='https://reddit.com/r/satisfactorygame' timestamp='1553238236670' title='satsifacredditory' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'audio'} points='42' media='' link='https://soundcloud.com/majorleaguewobs/hamster-dance-trap-remix' timestamp='1551038236670' title='asdf a' tags={['aas', 'basdf', 'casdf']} author='joe' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'text'} points='42' link='#' timestamp='1553238236670' title='asdf' tags={['aas', 'basdf', 'casdf']} author='joe' text='this is self text now boiz aslkdjf ajskfk fskld ajljfklajshfja hjkdfhsfhjks kdsajlf jdskl fjash fjkdhsjkafhajkshfjkdhsjka hfsdjkh fjkasdhfjksdhkaflhsdjklh asjkfh asdjkh fjkash kfjldhskja hfsdjkl hfjkasdh jkl hjkh fjkds ajkh s akljdfklsjkf akfdkl klajfkajfkdjkfjskl akl fklsdjklf askf sdkl jfsdjfklfj sdajfklaj fklsd fklsd flsd klsda fklj' />
                    <LinkCard mediaTypes={mediaTypes} mediaType={'video'} points='42' link='https://www.youtube.com/watch?v=RM4IjR3DtrQ' timestamp='1553238236670' title='asdfaaasss' tags={['aas', 'basdf', 'casdf']} author='joe' />
                </List>

            </Box>
        </Box>
    );
}

// Index.propTypes = {
//   classes: PropTypes.object.isRequired,
// };

// export default Index;
