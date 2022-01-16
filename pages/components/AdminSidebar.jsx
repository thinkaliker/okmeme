import React from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';

import AdminPanel from './AdminPanel';


export function AdminSidebar(props) {
  const { extraButtons } = props;
  const [open, setOpen] = React.useState(false);
  const sidebarIcon = extraButtons['admin'].icon;

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
        <ListItemIcon>{sidebarIcon}</ListItemIcon>
        <ListItemText sx={{ fontWeight: 500 }}>Admin</ListItemText>
      </ListItem>
      <AdminPanel open={open} handleModalClose={handleModalClose} />
    </React.Fragment>
  );

}

export default AdminSidebar;