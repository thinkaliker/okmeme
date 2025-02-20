import React from 'react';
import Button from '@mui/material/Button';

import AdminPanel from './AdminPanel';


export function AdminNavbar(props) {
  const { classes, extraButtons } = props;
  const [open, setOpen] = React.useState(false);
  const navbarIcon = extraButtons['admin'].icon;

  function handleModalOpen() {
    setOpen(true);
  }

  function handleModalClose() {
    setOpen(false);
  }

  return (
    <React.Fragment>
      <Button color='inherit' className={classes.navbarButton} onClick={handleModalOpen}>
        {navbarIcon}
        <span className={classes.buttonText}>Admin</span>
      </Button>
      <AdminPanel classes={classes} open={open} handleModalClose={handleModalClose} />
    </React.Fragment>
  );

}

export default AdminNavbar;