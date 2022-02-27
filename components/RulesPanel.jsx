import React from 'react';
import { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useTheme } from '@mui/material/styles';

import Rules from './Rules';


const buttonStyle = {
    marginBottom: '32px',
    display: 'block',
    width: '320px',
    fontSize: '16px',
    padding: '8px',
    cursor: 'pointer'
}


const RulesPanel = (props) => {

    const { open, handleModalClose } = props;

    return (
        <React.Fragment>
            <Dialog
                open={open}
                onClose={handleModalClose}
                id='modal'
            >
                <DialogTitle></DialogTitle>
                <DialogContent>
                    <Rules />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleModalClose} color='primary'>Close</Button>
                </DialogActions>
            </Dialog>
        </React.Fragment>
    )

}

export default RulesPanel;