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


export const categoryTypes = {
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