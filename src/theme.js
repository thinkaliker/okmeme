import { createTheme } from '@mui/material/styles';

// Create a theme instance.
const theme = createTheme({
    palette: {
        primary: {
            light: '#63a4ff',
            main: '#1976d2',
            dark: '#004ba0',
            contrastText: '#fff',
        },
        secondary: {
            light: '#ffa270',
            main: '#ff7043',
            dark: '#c63f17',
            contrastText: '#000',
        },
    },
});

export default theme;