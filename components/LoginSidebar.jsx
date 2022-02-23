import React from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';

import LoginPanel from './LoginPanel';


export function LoginSIdebar(props) {
  const { classes, extraButtons } = props;
  const [open, setOpen] = React.useState(false);
  const sidebarIcon = extraButtons['login'].icon;

  function handleModalOpen() {
    setOpen(true);
  }

  function handleModalClose() {
    setOpen(false);
  }

  return (
    <React.Fragment>
      <ListItem button key='login' sx={{
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 2
      }} onClick={handleModalOpen}>
        <ListItemIcon>{sidebarIcon}</ListItemIcon>
        <ListItemText sx={{ fontWeight: 500 }}>Login</ListItemText>
      </ListItem>
      <LoginPanel open={open} handleModalClose={handleModalClose} />
    </React.Fragment>
  );

}

export default LoginSIdebar;