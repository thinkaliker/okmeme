import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

import BuildIcon from '@mui/icons-material/Build';
import DoneOutlineIcon from '@mui/icons-material/DoneOutline';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import PermIdentityIcon from '@mui/icons-material/PermIdentity';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';


export function AdminPanel(props) {
  const { open, handleModalClose } = props;
  const [tabVal, setTabVal] = React.useState(0);

  function changeTab(event, val) {
    setTabVal(val);
  }

  return (
    <React.Fragment>
      <Dialog
        open={open}
        onClose={handleModalClose}
        id='modal-admin'
      >
        <DialogTitle>Admin Panel</DialogTitle>
        <DialogContent>
          <Tabs value={tabVal} onChange={changeTab}>
            <Tab label='User Requests' />
            <Tab label='User Management' />
            <Tab label='Post Management' />
          </Tabs>
          <div
            role='tabpanel'
            hidden={tabVal !== 0}
          >
            <List dense sx={{ minWidth: 500 }}>
              {
                ['a', 'b', 'c'].map(value => {
                  const labelId = `request-item-${value}`;
                  return (
                    <ListItem key={value} button>
                      <ListItemIcon>
                        <PermIdentityIcon />
                      </ListItemIcon>
                      <ListItemText id={labelId} primary={value} secondary='email@domain.com' />
                      <ListItemSecondaryAction>
                        <IconButton edge='end'>
                          <DoneOutlineIcon />
                        </IconButton>
                        <IconButton edge='end'>
                          <DeleteForeverIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })
              }
            </List>
          </div>
          <div
            role='tabpanel'
            hidden={tabVal !== 1}
          >
            <List dense sx={{ minWidth: 500 }}>
              {
                ['111', '222', '333'].map(value => {
                  const labelId = `users-item-${value}`;
                  return (
                    <ListItem key={value} button>
                      <ListItemIcon>
                        <VerifiedUserIcon />
                      </ListItemIcon>
                      <ListItemText id={labelId} primary={value} />
                      <ListItemSecondaryAction>
                        <IconButton edge='end'>
                          <ArrowDownwardIcon />
                        </IconButton>
                        <IconButton edge='end'>
                          <DeleteForeverIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })
              }
            </List>
          </div>
          <div
            role='tabpanel'
            hidden={tabVal !== 2}
          >
            <Typography>
              {/* when users report posts they will show up here */}
            </Typography>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleModalClose} color='primary'>Close</Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );

}

export default AdminPanel;