import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useTheme } from '@mui/material/styles';
import { Typography } from '@mui/material';
import Button from '@mui/material/Button';


export function LinkPreview(props) {
  const { title, url } = props;

  const [open, setOpen] = React.useState(false);

  function handleModalClose(event, value) {
    setOpen(false);
  }

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
          <img src={url}></img>
          <Typography>{title}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleModalClose} color='primary'>Close</Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  )

}

export default LinkPreview;