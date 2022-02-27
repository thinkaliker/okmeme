import React from 'react';
import ChatIcon from '@mui/icons-material/Chat';
import MovieIcon from '@mui/icons-material/Movie';
import PhotoIcon from '@mui/icons-material/Photo';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';


export const mediaTypes = {
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