import React from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import AddBoxIcon from '@mui/icons-material/AddBox';

import SubmitPanel from './SubmitPanel';


export function SubmitSidebar(props) {
  const { mediaTypes } = props;
  const [open, setOpen] = React.useState(false);

  function handleModalOpen() {
    setOpen(true);
  }

  function handleModalClose() {
    setOpen(false);
  }

  return (
    <React.Fragment>
      <ListItem button key='submit' sx={{
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 2
      }} onClick={handleModalOpen}>
        <ListItemIcon><AddBoxIcon /></ListItemIcon>
        <ListItemText sx={{ fontWeight: 500 }}>Submit</ListItemText>
      </ListItem>
      <SubmitPanel open={open} handleModalClose={handleModalClose} mediaTypes={mediaTypes} />
    </React.Fragment>
  );

}

export default SubmitSidebar;