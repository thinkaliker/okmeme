import React from 'react';
import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useTheme } from '@mui/material/styles';

import useSWR from 'swr'
import { supabase } from '../utils/initSupabase'
import Auth from './Auth'
// import { Auth, Space } from '@supabase/ui'
import { useUser } from '../lib/UserContext'

const fetcher = (url, token) =>
  fetch(url, {
    method: 'GET',
    headers: new Headers({ 'Content-Type': 'application/json', token }),
    credentials: 'same-origin',
  }).then((res) => res.json())

const LoginPanel = (props) => {

  const { open, handleModalClose } = props;
  const theme = useTheme();
  const { user, session } = useUser()
  const { data, error } = useSWR(session ? ['/api/getUser', session.access_token] : null, fetcher)
  const [authView, setAuthView] = useState('sign_in')

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setAuthView('update_password')
      if (event === 'USER_UPDATED') setTimeout(() => setAuthView('sign_in'), 1000)
      if (event === 'SIGNED_IN') {
        // console.log(user, session, data, fetcher);
        updateSupabaseCookie(event, session);
        // handleModalClose() 
      }
    })

    return () => {
      authListener.unsubscribe()
    }
    async function updateSupabaseCookie(event, session) {
      // Send session to /api/auth route to set the auth cookie.
      // NOTE: this is only needed if you're doing SSR (getServerSideProps)!
      console.log('asdfjkl', session, event)
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
        <DialogTitle>Login to OKMEME!</DialogTitle>
        <DialogContent>
          {user ?
            <div>logged in!</div>
            :
            <div style={{ maxWidth: '520px', margin: '96px auto' }}>
              <Auth supabaseClient={supabase} authView={authView} setAuthView={setAuthView} />
              {/* <Space>
                <Auth
                  supabaseClient={supabase}
                  providers={['google', 'github']}
                  view={authView}
                  socialLayout="horizontal"
                  socialButtonSize="xlarge"
                />
              </Space> */}
            </div>
          }
        </DialogContent>
        <DialogActions>

        </DialogActions>
      </Dialog>
    </React.Fragment>
  )

}

export default LoginPanel;