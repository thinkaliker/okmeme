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
import { useTheme } from '@mui/material/styles';


const visibilityTypes = [
  'Public', 'Verified Only', 'Staff Only'
]

const submitterTypes = [
  'As Yourself', 'As Verified', 'As Staff'
]

export function SubmitPanel(props) {

  const { handleModalClose, open, mediaTypes, linkType, tags, url, text, nsfw } = props;

  // const [open, setOpen] = React.useState(false)
  const theme = useTheme();
  const [mediaType, setMediaType] = React.useState('url')

  function handleMediaType(event) {
    setMediaType(event.target.value);
  }

  return (
    <React.Fragment>
      <Dialog
        open={open}
        onClose={handleModalClose}
        id='modal'
      >
        <DialogTitle>Submit a link</DialogTitle>
        <DialogContent>

          <TextField
            id="select-media-type"
            select
            fullWidth
            label="Media Type"
            onChange={handleMediaType}
            // sx={{
            //   '.MuiSelect-': {
            //     flex: 1,
            //     alignItems: 'left'
            //   }
            // }}
            value={mediaType}
            helperText="Select Media Type"
            margin="normal"
          >
            {Object.keys(mediaTypes).map(option => (
              <MenuItem key={option} value={option}>
                {mediaTypes[option]['icon']}
                {' '}
                {mediaTypes[option]['name']}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            id="title"
            label="Title goes here"
            fullWidth
            helperText="Enter a descriptive title or whatever"
          />
          {/* type and autosuggest existing ones in category or add a new one  */}
          <TextField
            id="tags"
            label="Tagging"
            helperText="Enter some tags"
            fullWidth
          />

          {/* changes based on link type */}
          {/* todo change helper text based on media type
                  pics: Enter direct image link ((need to think about imgur albums/custom embeds))
                  vids: Enter video link ((may want to think about custom embeds))
                  audio: Enter audio link ((may want to think about soundcloud/spotify/etc embeds))
                  url: Enter link
               */}
          <TextField
            id="link"
            label="Link"
            fullWidth
            helperText="Enter URL"
          />
          <TextField
            id="text"
            label="Text"
            fullWidth
            multiline
            helperText="Enter some text"
          />

          {/* highest visibility available based on role */}
          {/* <Grid
            container
            direction="row"
            justify="flex-start"
            alignItems="baseline"
            spacing={2}
            className={classes.grid}
          >
            <TextField
              id="select-post-visibility"
              select
              label=""
              className={classes.typePadding}
              value={visibilityTypes}
              SelectProps={{
                MenuProps: {
                  className: classes.menu,
                },
              }}
              helperText="Select post visibility"
              margin="normal"
            >
              {visibilityTypes.map(option => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField> */}

          {/* highest visibility available based on role */}
          {/* <TextField
              id="select-submit-visibility"
              select
              label=""
              className={classes.typePadding}
              value={visibleType}
              SelectProps={{
                MenuProps: {
                  className: classes.menu,
                },
              }}
              helperText="Select submitter visibility"
              margin="normal"
            >
              {submitterTypes.map(option => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          </Grid> */}
          {/* NSFW on auto defaults to post visibility verified only or higher if not already selected */}
          <FormGroup row>
            <FormControlLabel
              control={
                <Switch checked={nsfw} value="checkedA" />
              }
              label="NSFW (Visible to registered users only)"
            />
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleModalClose} color='secondary'>Cancel</Button>
          <Button onClick={handleModalClose} color='primary'>Submit</Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );

}

export default SubmitPanel;