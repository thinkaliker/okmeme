import React from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import SecurityIcon from '@mui/icons-material/Security';

import AdminPanel from './AdminPanel';


export function AdminSidebar(props) {
  const [open, setOpen] = React.useState(false);

  function handleModalOpen() {
    setOpen(true);
  }

  function handleModalClose() {
    setOpen(false);
  }

  return (
    <React.Fragment>
      <ListItem button key='admin' sx={{
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 2
      }} onClick={handleModalOpen}>
        <ListItemIcon><SecurityIcon /></ListItemIcon>
        <ListItemText sx={{ fontWeight: 500 }}>Admin</ListItemText>
      </ListItem>
      <AdminPanel open={open} handleModalClose={handleModalClose} />
    </React.Fragment>
  );

}

export default AdminSidebar;