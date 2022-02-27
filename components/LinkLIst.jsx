import React from 'react';
import List from '@mui/material/List';

import LinkCard from './LinkCard';

export function LinkList(props) {

    const { mediaTypes, supabase, loggedIn } = props;

    return (
        <List sx={{ paddingTop: 9 }}>
            <LinkCard loggedIn={loggedIn} mediaTypes={mediaTypes} mediaType={'text'} saved='12' link='#' timestamp='1553239282400' title='lizard really long text title asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf qwerty qwerty qwerty' tags={['a', 'b', 'c']} author='bob' />
            <LinkCard loggedIn={loggedIn} mediaTypes={mediaTypes} mediaType={'url'} saved='23' link='https://okme.me' timestamp='1553238236670' title='asdf asdf' tags={['aas', 'basdf', 'casdf']} author='joe' />
            <LinkCard loggedIn={loggedIn} mediaTypes={mediaTypes} mediaType={'image'} saved='69' media='https://i.redd.it/piutnnjg3en21.png' link='https://i.redd.it/piutnnjg3en21.png' timestamp='1553238236670' title='satiscraftory' tags={['aas', 'basdf', 'casdf']} author='joe' />
            <LinkCard loggedIn={loggedIn} mediaTypes={mediaTypes} mediaType={'text'} saved='0' link='#' timestamp='1553238236670' title='asdf sddf' tags={['aas', 'basdf', 'casdf']} author='joe' />
            <LinkCard loggedIn={loggedIn} mediaTypes={mediaTypes} mediaType={'image'} saved='42' media='https://i.redd.it/piutnnjg3en21.png' link='https://reddit.com/r/satisfactorygame' timestamp='1553238236670' title='satsifacredditory' tags={['aas', 'basdf', 'casdf']} author='joe' />
            <LinkCard loggedIn={loggedIn} mediaTypes={mediaTypes} mediaType={'audio'} saved='42' media='' link='https://soundcloud.com/majorleaguewobs/hamster-dance-trap-remix' timestamp='1551038236670' title='asdf a' tags={['aas', 'basdf', 'casdf']} author='joe' />
            <LinkCard loggedIn={loggedIn} mediaTypes={mediaTypes} mediaType={'text'} saved='42' link='#' timestamp='1553238236670' title='asdf' tags={['aas', 'basdf', 'casdf']} author='joe' text='this is self text now boiz aslkdjf ajskfk fskld ajljfklajshfja hjkdfhsfhjks kdsajlf jdskl fjash fjkdhsjkafhajkshfjkdhsjka hfsdjkh fjkasdhfjksdhkaflhsdjklh asjkfh asdjkh fjkash kfjldhskja hfsdjkl hfjkasdh jkl hjkh fjkds ajkh s akljdfklsjkf akfdkl klajfkajfkdjkfjskl akl fklsdjklf askf sdkl jfsdjfklfj sdajfklaj fklsd fklsd flsd klsda fklj' />
            <LinkCard loggedIn={loggedIn} mediaTypes={mediaTypes} mediaType={'video'} saved='42' link='https://www.youtube.com/watch?v=RM4IjR3DtrQ' timestamp='1553238236670' title='asdfaaasss' tags={['aas', 'basdf', 'casdf']} author='joe' />
        </List>
    )
}

export default LinkList;