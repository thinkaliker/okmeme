import React from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import InputIcon from '@mui/icons-material/Input';

import LoginPanel from './LoginPanel';


export function LoginSidebar(props) {
  const { supabase } = props;
  const [open, setOpen] = React.useState(false);

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
        <ListItemIcon><InputIcon /></ListItemIcon>
        <ListItemText sx={{ fontWeight: 500 }}>
          {
            supabase.auth.user() ? 'Logout' : 'Login'
          }
        </ListItemText>
      </ListItem>
      <LoginPanel supabase={supabase} open={open} handleModalClose={handleModalClose} />
    </React.Fragment>
  );

}

export default LoginSidebar;