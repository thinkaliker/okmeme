import React from 'react';

import { categoryTypes } from './consts/categoryTypes';

import SidebarItem from './SidebarItem';


export function TagSidebar(props) {

    // const { categoryTypes } = props;


    return (
        <React.Fragment>
            <SidebarItem item={categoryTypes['music']} tags={['Electronic', 'Chill', 'Classical', 'Rock']} />
            <SidebarItem item={categoryTypes['videos']} tags={['YouTube', 'GFY', 'Other']} />
            <SidebarItem item={categoryTypes['images']} tags={['Imgur', 'Art', 'Instagram']} />
            <SidebarItem item={categoryTypes['games']} tags={['PC', 'XBOX', 'PlayStation', 'Nintendo', 'Mobile']} />
            <SidebarItem item={categoryTypes['code']} tags={['Web', 'Python', 'Games']} />
            <SidebarItem item={categoryTypes['tech']} tags={['Computers', 'Phones', 'Gadgets', 'Wearables']} />
            <SidebarItem item={categoryTypes['cars']} tags={['Four Wheels', 'Two Wheels']} />
            <SidebarItem item={categoryTypes['outside']} tags={['Camp', 'Hike', 'Run']} />
            <SidebarItem item={categoryTypes['shopping']} tags={['Deals', 'Parts']} />
            <SidebarItem item={categoryTypes['food']} tags={['Recipes', 'Videos']} />
            <SidebarItem item={categoryTypes['memes']} tags={['.jpg', '.gif', '.mp4']} />
        </React.Fragment>
    )

}

export default TagSidebar;