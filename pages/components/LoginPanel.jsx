import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';

export function LoginPanel(props) {
  const { open, handleModalClose } = props;
  const theme = useTheme();

  return (
    <React.Fragment>
      <Dialog
        open={open}
        onClose={handleModalClose}
        id='modal'
      >
        <DialogTitle>Login to OKMEME!</DialogTitle>
        <DialogContent>
          put the firebase login thing here
        </DialogContent>
        <DialogActions>

        </DialogActions>
      </Dialog>
    </React.Fragment>
  )

}

export default LoginPanel;