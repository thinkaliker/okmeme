import React from 'react';
import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';

import useSWR from 'swr';
import Auth from './Auth';
import { useUser } from '../lib/UserContext';


const buttonStyle = {
  marginBottom: '4px'
}

const fetcher = (url, token) =>
  fetch(url, {
    method: 'GET',
    headers: new Headers({ 'Content-Type': 'application/json', token }),
    credentials: 'same-origin',
  }).then((res) => res.json())

const LoginPanel = (props) => {

  const { open, handleModalClose, supabase, loggedIn } = props;
  const theme = useTheme();
  const { user, session } = useUser()
  const { data, error } = useSWR(session ? ['/api/getUser', session.access_token] : null, fetcher)
  const [authView, setAuthView] = useState('sign_in')

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setAuthView('update_password')
      if (event === 'USER_UPDATED') setAuthView('sign_in')
      if (event === 'SIGNED_IN') {
        // console.log(user, session, data, fetcher);
        updateSupabaseCookie(event, session);
        handleModalClose()
        console.log('Signed in!')
      }
      if (event === 'SIGNED_OUT') {
        handleModalClose()
      }
    });

    return () => {
      authListener.unsubscribe()
    }
    async function updateSupabaseCookie(event, session) {
      // Send session to /api/auth route to set the auth cookie.
      // NOTE: this is only needed if you're doing SSR (getServerSideProps)!
      if (!session) return;
      await fetch("/api/auth", {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({ event, session }),
      });
    }
  }, [])


  return (
    <React.Fragment>
      <Dialog
        open={open}
        onClose={handleModalClose}
        id='modal'
      >
        <DialogTitle>{loggedIn ? 'Account Management' : 'Login to OKMEME!'}</DialogTitle>
        <DialogContent>
          {loggedIn ?
            <>
              <h5>Account: {supabase.auth.user().email}</h5>
              <Button
                href={'/account?view=update_password&email=' + supabase.auth.user().email}
                target="_blank"
                fullWidth
                variant="outlined"
                color="secondary"
                style={buttonStyle}
              >
                Update Password
              </Button>

              <Button
                type="submit"
                fullWidth
                variant="contained"
                style={buttonStyle}
                onClick={() => supabase.auth.signOut()}
                color="secondary"
              >
                Log Out
              </Button>
            </>
            :
            <div style={{ maxWidth: '320px', margin: 'auto' }}>
              <Auth providedEmail={''} supabaseClient={supabase} authView={authView} setAuthView={setAuthView} />
            </div>
          }
        </DialogContent>
        <DialogActions>

        </DialogActions>
      </Dialog>
    </React.Fragment >
  )

}

export default LoginPanel;