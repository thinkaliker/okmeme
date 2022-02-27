import React from 'react';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Button from '@mui/material/Button';
import Hidden from '@mui/material/Hidden';
import TimeAgo from 'react-timeago';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';

import ReportPanel from './ReportPanel';
import LinkPreview from './LinkPreview';
import { BookmarkItem } from './BookmarkItem';

function getHostname(url) {
  return new URL(url).host;
}

const drawerWidth = 240;


export function LinkCard(props) {
  const theme = useTheme();
  const [mediaPreview, setMediaPreview] = React.useState(false);
  const [textPreview, setTextPreview] = React.useState(false);

  function handleMediaClick(event, value) {
    setMediaPreview(!mediaPreview);
  }

  function handleTextClick(event, value) {
    setTextPreview(!textPreview);
  }

  const { mediaType, mediaTypes, media, link, title, tags, saved, author, timestamp, text } = props;

  let shortLink = 'text';
  if (link !== '#') {
    shortLink = getHostname(link)
  } else {
    shortLink = 'text'
  }

  return (
    <React.Fragment>
      <Card sx={{ marginBottom: 1 }}>
        <CardActionArea onClick={!text ? null : handleTextClick}>
          {link === '#' ?
            <CardContent>
              <Typography variant="h6">
                {mediaTypes[mediaType]['icon']}&nbsp;{title}
              </Typography>
            </CardContent>
            :
            <CardContent>
              <Tooltip title={link} placement='bottom-start'>
                <a href={link} target='_blank' rel="noopener noreferrer" style={{
                  color: 'inherit',
                  textDecoration: 'none',
                }}>
                  <Typography variant="h6">
                    {mediaTypes[mediaType]['icon']}&nbsp;{title} <Typography variant="overline" color="secondary">{shortLink}</Typography>
                  </Typography>
                </a>
              </Tooltip>
            </CardContent>
          }
          {!media ? null :
            <Hidden xsDown>
              {/* <LinkPreview url={media} title={title} /> */}
              <CardMedia
                sx={{ height: 100 }}
                image={media}
                title={title}
                onClick={handleMediaClick}
              />
            </Hidden>
          }
          {!text ? null :
            <CardContent>
              {!textPreview ?
                <Typography variant="body1">{({ text }.text).substring(0, 64) + '...'}&nbsp;<AddCircleIcon /></Typography>
                :
                <Typography variant="body1">{text}&nbsp;<RemoveCircleIcon /></Typography>
              }
            </CardContent>
          }
        </CardActionArea>
        <CardActions>
          <Button size="small" color="secondary">
            <BookmarkItem />&nbsp;{saved > 0 ? saved : null}
          </Button>
          {/* <Button size="small" color="secondary"> */}
          {/* hide name if not logged in */}
          {/* {author} */}
          {/* </Button> */}
          <Hidden xsDown>
            <Tooltip title={(new Date(parseInt({ timestamp }.timestamp)).toISOString())}>
              <Button size="small" color="primary">
                <TimeAgo date={parseInt(timestamp)} title='' />
              </Button>
            </Tooltip>
          </Hidden>
          <Hidden smDown>
            <Typography variant='body1'>|</Typography>
            <div>
              {tags.map((tag, index) => (
                <Button size="small" color="primary" key={title + tag + index}>
                  {tag}
                </Button>
              ))
              }
            </div>
          </Hidden>
          <div style={{ flexGrow: 1 }}></div>
          {/* <ReportPanel /> */}
        </CardActions>
      </Card>
    </React.Fragment>
  );
}

export default LinkCard;