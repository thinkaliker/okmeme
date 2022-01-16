import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Grid from '@mui/material/Grid';
import ReportIcon from '@mui/icons-material/Report';
import { useTheme } from '@mui/material/styles';

const reasons = {
  'dmca': {
    name: 'DMCA',
    description: 'You believe the content violates DMCA.'
  },
  'nsfw': {
    name: 'NSFW',
    description: 'You believe the content should/shouldn\'t be marked NSFW.'
  },
  'spam': {
    name: 'Spam',
    description: 'You believe the content is spam.'
  },
  'other': {
    name: 'Other Reason',
    description: 'Moderators should take a look.'
  }
}

export function ReportPanel(props) {

  // const { classes } = props;
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('other');

  function handleModalOpen(event, value) {
    setOpen(true);
  }

  function handleModalClose(event, value) {
    setOpen(false);
  }

  return (
    <React.Fragment>
      <Button size="small" color="secondary" onClick={handleModalOpen}>
        <ReportIcon />
      </Button>
      <Dialog

        open={open}
        onClose={handleModalClose}
        id='modal'
      >
        <DialogTitle>Submit a Report</DialogTitle>
        <DialogContent>

          <TextField
            id="select-report-reason"
            select
            fullWidth
            label="Report Reason"
            onChange={(event) => {
              setReason(event.target.value);
            }}
            value={reason}
            helperText="Select Report Reason"
            margin="normal"
          >
            {
              Object.keys(reasons).map(option => (
                <MenuItem key={option} value={option}>
                  {reasons[option]['name']} - {reasons[option]['description']}
                </MenuItem>
              ))
            }
          </TextField>

          <TextField
            id="information"
            label="Additional information"
            fullWidth
            helperText="Enter additional information"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleModalClose} color='secondary'>Cancel</Button>
          <Button onClick={handleModalClose} color='primary'>Submit</Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );

}

export default ReportPanel;