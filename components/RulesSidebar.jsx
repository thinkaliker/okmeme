import React from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import HelpIcon from '@mui/icons-material/Help';

import RulesPanel from './RulesPanel';


export function RulesSidebar(props) {
    const [open, setOpen] = React.useState(false);

    function handleModalOpen() {
        setOpen(true);
    }

    function handleModalClose() {
        setOpen(false);
    }

    return (
        <React.Fragment>
            <ListItem button key='rules' sx={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 2
            }} onClick={handleModalOpen}>
                <ListItemIcon><HelpIcon /></ListItemIcon>
                <ListItemText sx={{ fontWeight: 500 }}>Rules</ListItemText>
            </ListItem>
            <RulesPanel open={open} handleModalClose={handleModalClose} />
        </React.Fragment>
    );

}

export default RulesSidebar;