import React, { useEffect, useState } from 'react'

import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';


const inputStyle = {
    marginBottom: '16px',
}

const buttonStyle = {
    marginBottom: '32px',
    display: 'block',
    width: '320px',
    fontSize: '16px',
    padding: '8px',
    cursor: 'pointer'
}

function Auth(props) {
    const { supabaseClient, authView, setAuthView, providedEmail } = props
    const [email, setEmail] = useState(providedEmail)
    const [password, setPassword] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSignIn = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        const { error: signInError } = await supabaseClient.auth.signIn({
            email,
            password,
        })
        if (signInError) setError(signInError.message)

        setLoading(false)
    }

    const handleSignUp = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        const { error: signUpError } = await supabaseClient.auth.update({
            email,
            password,
        })
        if (signUpError) setError(signUpError.message)
        else setMessage('Password set!')
        setLoading(false)
    }

    const handlePasswordReset = async (e) => {
        e.preventDefault()
        setError('')
        setMessage('')
        setLoading(true)
        const { error } = await supabaseClient.auth.api.resetPasswordForEmail(email)
        if (error) setError(error.message)
        else setMessage('Check your email for the password reset link')
        setLoading(false)
    }

    const handleMagicLinkSignIn = async (e) => {
        e.preventDefault()
        setError('')
        setMessage('')
        setLoading(true)
        const { error } = await supabaseClient.auth.signIn({ email })
        if (error) setError(error.message)
        else setMessage('Check your email for the magic link')
        setLoading(false)
    }

    return (
        <>
            {loading && <h3>Loading..</h3>}
            {error && <div style={{ color: 'red' }}>{error}</div>}
            {message && <div style={{ color: 'green' }}>{message}</div>}
            {authView === 'sign_in' ? (
                <>
                    <h4>Sign in</h4>
                    <form onSubmit={(e) => handleSignIn(e)}>
                        <TextField
                            id="sign-in__email"
                            label="Email address"
                            autoComplete="email"
                            placeholder="okmeme@example.com"
                            defaultValue={email}
                            onChange={(e) => setEmail(e.target.value)}
                            fullWidth
                            style={inputStyle}
                        />
                        <TextField
                            id="sign-in__password"
                            label="Password"
                            type="password"
                            autoComplete="current-password"
                            defaultValue={password}
                            onChange={(e) => setPassword(e.target.value)}
                            fullWidth
                            style={inputStyle}
                        />
                        <Button type="submit" fullWidth variant="contained">Sign In</Button>
                    </form>
                    <hr />
                    {/* <a onClick={() => setAuthView('sign_up')}>Don't have an account? Sign up</a> */}
                    <Button onClick={() => setAuthView('forgotten_password')}>Forgot my password</Button>
                    {/* <hr />
                    <a onClick={() => setAuthView('magic_link')}>Send magic link email</a> */}
                </>
            ) : authView === 'sign_up' ? (
                <>
                    <h4>Sign up</h4>
                    <form onSubmit={(e) => handleSignUp(e)}>
                        <TextField
                            id="sign-up__email"
                            label="Email address"
                            autoComplete="email"
                            placeholder="okmeme@example.com"
                            defaultValue={email}
                            onChange={(e) => setEmail(e.target.value)}
                            fullWidth
                            style={inputStyle}
                        />
                        <TextField
                            id="sign-up__password"
                            label="Password"
                            type="password"
                            autoComplete="current-password"
                            defaultValue={password}
                            onChange={(e) => setPassword(e.target.value)}
                            fullWidth
                            style={inputStyle}
                        />
                        <Button type="submit" fullWidth variant="contained">Sign Up</Button>
                    </form>
                    {/* <hr /> */}
                    {/* <a onClick={() => setAuthView('sign_in')}>Already have an account? Sign in</a> */}
                    {/* <a onClick={() => setAuthView('forgotten_password')}>Forgot my password</a> */}
                </>
            ) : authView === 'forgotten_password' ? (
                <>
                    <h4>Forgotten Password / Password Reset</h4>
                    <form onSubmit={handlePasswordReset}>
                        <TextField
                            id="forgotten_password__email"
                            label="Email address"
                            autoComplete="email"
                            placeholder="okmeme@example.com"
                            defaultValue={email}
                            onChange={(e) => setEmail(e.target.value)}
                            fullWidth
                            style={inputStyle}
                        />
                        <Button type="submit" fullWidth variant="contained">Send reset email</Button>
                    </form>
                    <hr />
                    {/* <a onClick={() => setAuthView('sign_up')}>Don't have an account? Sign up</a> */}
                    <Button onClick={() => setAuthView('sign_in')}>Already have an account? Sign in</Button>
                    {/* <a onClick={() => setAuthView('magic_link')}>Send magic link email</a> */}
                </>
            ) : authView === 'magic_link' ? (
                <>
                    <h4>Magic link</h4>
                    <form onSubmit={handleMagicLinkSignIn}>
                        <TextField
                            id="magic__email"
                            label="Email address"
                            autoComplete="email"
                            placeholder="okmeme@example.com"
                            defaultValue={email}
                            onChange={(e) => setEmail(e.target.value)}
                            fullWidth
                            style={inputStyle}
                        />
                        <Button type="submit" fullWidth variant="contained">Send Magic Link</Button>
                    </form>
                    <hr />
                    {/* <a onClick={() => setAuthView('sign_up')}>Don't have an account? Sign up</a> */}
                    <Button onClick={() => setAuthView('sign_in')}>Already have an account? Sign in</Button>
                </>
            ) : authView === 'update_password' ? (
                <>
                    <div>update</div>
                </>
            ) : null}
        </>
    )
}

function UpdatePassword({ supabaseClient }) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)

    const handlePasswordReset = async (e) => {
        e.preventDefault()
        setError('')
        setMessage('')
        setLoading(true)
        const { error } = await supabaseClient.auth.update({ password })
        if (error) setError(error.message)
        else setMessage('Your password has been updated')
        setLoading(false)
    }

    return (
        <>
            {loading && <h3>Loading..</h3>}
            {error && <div style={{ color: 'red' }}>{error}</div>}
            {message && <div style={{ color: 'green' }}>{message}</div>}
            <h4>Set a new password</h4>
            <form onSubmit={handlePasswordReset}>
                <TextField
                    id="sign-in__password"
                    label="New Password"
                    type="password"
                    defaultValue={password}
                    onChange={(e) => setPassword(e.target.value)}
                    fullWidth
                    style={inputStyle}
                />
                <Button type="submit" fullWidth variant="contained">Update Password</Button>
            </form>
        </>
    )
}

Auth.UpdatePassword = UpdatePassword
export default Auth