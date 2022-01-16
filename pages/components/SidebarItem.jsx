import React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import { useTheme } from '@mui/material/styles';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { Collapse } from '@mui/material';

export function SidebarItem(props) {
  const { item, tags } = props;
  const [open, setOpen] = React.useState(false);

  function handleClick(event, value) {
    setOpen(!open);
  }

  const theme = useTheme();

  return (
    <React.Fragment>
      {!tags ?
        <ListItem button key={item.name} sx={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 2
        }}>
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText>{item.name}</ListItemText>
        </ListItem>
        :
        <React.Fragment>
          <ListItem button key={item.name} sx={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 2
          }} onClick={handleClick}>
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText sx={{ fontWeight: 500 }}>{item.name}</ListItemText>
          </ListItem>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <List component='div' disablePadding>
              {tags.map((tag, index) => (
                <ListItem button key={tag} sx={{ paddingLeft: theme.spacing }}>
                  <ListItemIcon><ArrowForwardIosIcon /></ListItemIcon>
                  <ListItemText size="small">{tag}</ListItemText>
                </ListItem>
              ))
              }
            </List>
          </Collapse>
        </React.Fragment>
      }

    </React.Fragment>
  );
}

export default SidebarItem;