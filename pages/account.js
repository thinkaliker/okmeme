import Link from 'next/link'
import useSWR from 'swr'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../utils/initSupabase'
import Auth from '../components/Auth'
import { useUser } from '../lib/UserContext'

const fetcher = (url, token) =>
  fetch(url, {
    method: 'GET',
    headers: new Headers({ 'Content-Type': 'application/json', token }),
    credentials: 'same-origin',
  }).then((res) => res.json())

const Account = () => {
    const { user, session } = useUser()
    const { data, error } = useSWR(session ? ['/api/getUser', session.access_token] : null, fetcher)
    
    const router = useRouter();
    // const { email, view } = router.query

    // const [authView, setAuthView] = useState('forgotten_password')
    const { email, view } = router.query
    // const loadView = (view === undefined) ? 'forgotten_password' : view;
    const [authView, setAuthView] = useState('')
    // console.log(authView)

    useEffect(() => {    
      if (router.isReady) {
        const { view } = router.query;
        if (view !== ''){
          setAuthView(view)
        }
        console.log('ready', view, authView)
      }

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') setAuthView('update_password')
          if (event === 'USER_UPDATED') setAuthView('sign_in')
          if (event === 'SIGNED_IN') updateSupabaseCookie(event, session);        
        })

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
      }, [view])
    
      
    const View = () => {
      if (authView === undefined || authView === '') {
        return(
          <h2>Nope.</h2>
        )
      }
      if (!user)
        return (
          <>
          <div>
              <img src="/okmeme.png" width="96" />
              <h2>
              Reset Password
              </h2>
              { authView !== 'update_password' &&
                <Auth providedEmail={email} supabaseClient={supabase} authView={authView} setAuthView={setAuthView} />
              }
              {
                authView === 'update_password' &&  <Auth.UpdatePassword supabaseClient={supabase} /> 
              }
          </div>
          
          </>
        )
      else
        return (
          <>
          <h2>aaaaaaa</h2>
          </>
        )
    }
    
    return (
      <div style={{ maxWidth: '520px', margin: '96px auto' }}>
        <View />
      </div>
    )
  }
  
  export default Account