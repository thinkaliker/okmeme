import React from 'react';

const Rules = () => {

    const View = () => {
        return (
            <div>
                <img src="/okmeme.png" width="96" />
                <h2>OKMEME Rules</h2>
                <ol>
                    <li>You must be at least 18 years old to use OKMEME.</li>
                    <li>No illegal content.</li>
                    <li>NSFW/sensitive content must be restricted.</li>
                    <li>No personal information.</li>
                    <li>No harrassment. Watch your language.</li>
                    <li>Referral links are ok, but must be clearly marked.</li>
                    <li>Spam = ban</li>
                    <li>Moderators have final say in posts.</li>
                </ol>
                <h2>Post Guidelines</h2>
                <ol>
                    <li>As long as you follow the rules, anything else goes.</li>
                    <li>Please tag and categorize your posts as best you can.</li>
                </ol>
            </div>
        )
    }

    return (
        <div style={{ maxWidth: '520px', margin: 'auto' }}>
            <View />
        </div>
    )
}

export default Rules