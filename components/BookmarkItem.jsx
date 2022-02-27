import React from 'react';
import Button from '@mui/material/Button';

import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';

export function BookmarkItem(props) {
    const { saved } = props;

    return (
        <Button size="small" color="secondary">
            <BookmarkBorderIcon />&nbsp;{saved > 0 ? saved : null}
        </Button>
    )
}