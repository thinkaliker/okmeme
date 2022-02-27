import React from 'react';

import GradientIcon from '@mui/icons-material/Gradient';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MovieIcon from '@mui/icons-material/Movie';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import VideogameAsset from '@mui/icons-material/VideogameAsset';
import DevicesIcon from '@mui/icons-material/Devices';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CakeIcon from '@mui/icons-material/Cake';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PlaceIcon from '@mui/icons-material/Place';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import FastfoodIcon from '@mui/icons-material/Fastfood';

import SidebarItem from './SidebarItem';


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

export function TagSidebar(props) {

    // const { categoryTypes } = props;


    return (
        <React.Fragment>
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
        </React.Fragment>
    )

}

export default TagSidebar;