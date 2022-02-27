import Link from 'next/link'
import useSWR from 'swr'
import { useEffect, useState } from 'react'
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

  const Login = () => {
    const { user, session } = useUser();
    const { data, error } = useSWR(session ? ['/api/getUser', session.access_token] : null, fetcher);
    
    const router = useRouter();
    const { email } = router.query;
    const [authView, setAuthView] = useState('sign_up');
    
  
    useEffect(() => {
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') setAuthView('update_password')
        if (event === 'USER_UPDATED') router.push('/')
        // Send session to /api/auth route to set the auth cookie.
        // NOTE: this is only needed if you're doing SSR (getServerSideProps)!
        fetch('/api/auth', {
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          credentials: 'same-origin',
          body: JSON.stringify({ event, session }),
        }).then((res) => res.json())
      })
  
      return () => {
        authListener.unsubscribe()
      }
    }, [])
  
    const View = () => {
      if (!user)
        return (
          <>
            <div>
              <img src="/okmeme.png" width="96" />
              <h2>
                OKMEME Signup
              </h2>
            </div>
            <Auth providedEmail={email} supabaseClient={supabase} authView={authView} setAuthView={setAuthView} />
          </>
        )
      else
        return (
          <h2>Nope.</h2>
        )
    }
  
    return (
      <div style={{ maxWidth: '520px', margin: '96px auto' }}>
        <View />
      </div>
    )
  }
  
  export default Login