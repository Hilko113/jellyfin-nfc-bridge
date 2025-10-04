const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Initialize the express app
const app = express();
const port = 80;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// --- App State ---
let settings;
let activeSessions = { movie: null, music: null };

// --- Load Settings ---
try {
    const settingsRaw = fs.readFileSync('settings.json');
    settings = JSON.parse(settingsRaw);
    if (settings.activeSessions) {
        activeSessions = { ...activeSessions, ...settings.activeSessions };
        if (activeSessions.movie) {
            console.log(`Restored active MOVIE session: ${activeSessions.movie.name}`);
        }
        if (activeSessions.music) {
            console.log(`Restored active MUSIC session: ${activeSessions.music.name}`);
        }
    }
} catch (error) {
    console.error("Error reading settings.json file!", error);
    process.exit(1);
}
const { jellyfinBaseUrl, apiKey, targetUsername } = settings;

// --- Database Setup ---
const db = new Database('jellyfin_movies.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie TEXT NOT NULL,
    trigger_word TEXT NOT NULL UNIQUE,
    jellyfin_id TEXT NOT NULL UNIQUE
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album TEXT NOT NULL,
    trigger_word TEXT NOT NULL UNIQUE,
    jellyfin_id TEXT NOT NULL UNIQUE
  )
`);

const movieCountStmt = db.prepare('SELECT COUNT(*) as count FROM movies');
const { count: movieCount } = movieCountStmt.get();
if (movieCount === 0) {
    console.log('Movie database is empty, inserting initial movie...');
    const insertStmt = db.prepare(`INSERT OR IGNORE INTO movies (movie, trigger_word, jellyfin_id) VALUES (?, ?, ?)`);
    insertStmt.run('Example Movie (2000)','examplemovie','1234567890abcdef1234567890abcdef');
    console.log('"Example Movie" added to the database.');
}

const albumCountStmt = db.prepare('SELECT COUNT(*) as count FROM albums');
const { count: albumCount } = albumCountStmt.get();
if (albumCount === 0) {
    console.log('Album database is empty, inserting initial album...');
    const insertStmt = db.prepare(`INSERT OR IGNORE INTO albums (album, trigger_word, jellyfin_id) VALUES (?, ?, ?)`);
    insertStmt.run('Example Album (Artist)','examplealbum','abcdef1234567890abcdef1234567890');
    console.log('"Example Album" added to the database.');
}


// --- Helper Functions ---
async function getUserId(username) {
    try {
        const response = await axios.get(`${jellyfinBaseUrl}/Users`, { headers: { 'X-Emby-Token': apiKey } });
        const user = response.data.find(u => u.Name === username);
        return user ? user.Id : null;
    } catch (error) {
        console.error("Failed to fetch users from Jellyfin:", error.message);
        return null;
    }
}

function saveSettings() {
    try {
        settings.activeSessions = activeSessions;
        fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
        console.log('Settings saved to settings.json');
    } catch (error) {
        console.error('Error saving settings to settings.json:', error);
    }
}

// --- Route Definitions ---

// Main page route to show both movie and music active sessions
app.get('/', (req, res) => {
    const selectMoviesStmt = db.prepare('SELECT * FROM movies ORDER BY movie');
    const movies = selectMoviesStmt.all();
    const movieTableRows = movies.map(movie => `
        <tr>
            <td>${movie.movie}</td><td>${movie.trigger_word}</td><td>${movie.jellyfin_id}</td>
            <td><form action="/delete-movie/${movie.id}" method="POST" style="margin:0;"><button type="submit" class="delete-btn">Delete</button></form></td>
        </tr>`).join('');
    
    const selectAlbumsStmt = db.prepare('SELECT * FROM albums ORDER BY album');
    const albums = selectAlbumsStmt.all();
    const albumTableRows = albums.map(album => `
        <tr>
            <td>${album.album}</td><td>${album.trigger_word}</td><td>${album.jellyfin_id}</td>
            <td><form action="/delete-album/${album.id}" method="POST" style="margin:0;"><button type="submit" class="delete-btn">Delete</button></form></td>
        </tr>`).join('');

    // Function to generate HTML for an active session bar
    const createActiveSessionHtml = (type, session) => {
        const title = type.charAt(0).toUpperCase() + type.slice(1); // Capitalize type
        if (session) {
            return `
                <div class="active-session-bar">
                    <span>Active <strong>${title}</strong> Device: <strong>${session.name}</strong> (${session.client})</span>
                    <form action="/clear-active-session/${type}" method="POST" style="margin:0;">
                        <button type="submit" class="clear-btn">Clear</button>
                    </form>
                </div>
            `;
        }
        return `<div class="active-session-bar"><span>Active <strong>${title}</strong> Device: <span class="none">None selected</div></span>`;
    };
    
    const activeSessionsHtml = createActiveSessionHtml('movie', activeSessions.movie) + createActiveSessionHtml('music', activeSessions.music);

    res.send(`
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Jellyfin NFC Bridge</title>
        <style>
            body { font-family: sans-serif; background-color: #f4f4f9; color: #333; margin: 2rem; }
            .container { max-width: 900px; margin: auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .header { display: flex; justify-content: space-between; align-items: center; } h1 { margin-right: 1rem; }
            h2 { text-align: center; margin-top: 3rem; } .center-form {text-align: center;}
            input[type="text"] { padding: 10px; width: 250px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 1rem; }
            button { padding: 10px 15px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background-color: #0056b3; } table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { padding: 12px; border: 1px solid #ddd; text-align: left; word-break: break-all; }
            th { background-color: #f2f2f2; } .delete-btn { background-color: #dc3545; }
            .delete-btn:hover { background-color: #c82333; }
            .active-session-bar { display: flex; justify-content: space-between; align-items: center; background: #e9ecef; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
            .active-session-bar .none { font-style: italic; color: #6c757d; }
            .clear-btn { background-color: #ffc107; color: black; } .clear-btn:hover { background-color: #e0a800; }
        </style></head><body><div class="container"><div class="header"><h1>Jellyfin NFC Bridge</h1>
        <a href="/sessions"><button>Change Active Device</button></a></div>${activeSessionsHtml}
        <h2>Movies</h2><form action="/search-movie" method="POST" class="center-form"><input type="text" name="movieName" placeholder="e.g., Inception" required><button type="submit">Add Movie</button></form>        
        <table><thead><tr><th>Movie</th><th>Trigger</th><th>JellyfinID</th><th>Action</th></tr></thead><tbody>${movieTableRows}</tbody></table>
        <h2>Albums</h2><form action="/search-music" method="POST" class="center-form"><input type="text" name="albumName" placeholder="e.g., Dark Side of the Moon" required><button type="submit">Add Album</button></form>        
        <table><thead><tr><th>Album</th><th>Trigger</th><th>JellyfinID</th><th>Action</th></tr></thead><tbody>${albumTableRows}</tbody></table>
</div></body></html>
    `);
});

// Sessions page to allow selecting a device for a specific purpose (movie/music)
app.get('/sessions', async (req, res) => {
    try {
        const response = await axios.get(`${jellyfinBaseUrl}/Sessions`, { headers: { 'X-Emby-Token': apiKey } });
        const sessions = response.data;
        const tableRows = sessions.map(session => `
            <tr>
                <td>${session.Client}</td><td>${session.DeviceName}</td><td>${session.UserName}</td><td><code>${session.Id}</code></td>
                <td class="action-buttons">
                    <form action="/set-active-session" method="POST">
                        <input type="hidden" name="sessionId" value="${session.Id}"><input type="hidden" name="deviceName" value="${session.DeviceName}">
                        <input type="hidden" name="client" value="${session.Client}"><input type="hidden" name="type" value="movie">
                        <button type="submit" class="select-btn-movie">For Movies</button>
                    </form>
                    <form action="/set-active-session" method="POST">
                        <input type="hidden" name="sessionId" value="${session.Id}"><input type="hidden" name="deviceName" value="${session.DeviceName}">
                        <input type="hidden" name="client" value="${session.Client}"><input type="hidden" name="type" value="music">
                        <button type="submit" class="select-btn-music">For Music</button>
                    </form>
                </td>
            </tr>`).join('');
        res.send(`
            <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Active Jellyfin Sessions</title>
            <style>
                body { font-family: sans-serif; background-color: #f4f4f9; margin: 2rem; }
                .container { max-width: 1000px; margin: auto; background: white; padding: 2rem; border-radius: 8px; }
                h1 { text-align: center; } table { width: 100%; border-collapse: collapse; margin-top: 2rem; }
                th, td { padding: 12px; border: 1px solid #ddd; text-align: left; word-break: break-all; }
                th { background-color: #f2f2f2; } a { text-decoration: none; }
                button { padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; color: white; }
                .action-buttons { display: flex; gap: 5px; } .action-buttons form { margin: 0; }
                .back-btn { background-color: #6c757d; } .back-btn:hover { background-color: #5a6268; }
                .select-btn-movie { background-color: #007bff; } .select-btn-movie:hover { background-color: #0056b3; }
                .select-btn-music { background-color: #9c27b0; } .select-btn-music:hover { background-color: #7b1fa2; }
            </style></head><body><div class="container"><h1>Active Jellyfin Sessions</h1>
            <a href="/"><button class="back-btn">&larr; Back to Main Page</button></a>
            <table><thead><tr><th>Client</th><th>Device Name</th><th>User</th><th>Session ID</th><th>Action</th></tr></thead>
            <tbody>${sessions.length > 0 ? tableRows : '<tr><td colspan="5" style="text-align:center;">No active sessions found.</td></tr>'}</tbody>
            </table></div></body></html>
        `);
    } catch (error) {
        console.error("Failed to fetch sessions from Jellyfin:", error.message);
        res.status(500).send("Error connecting to Jellyfin. Check the server console for details.");
    }
});

// Movie search route
app.post('/search-movie', async (req, res) => {
    const movieName = req.body.movieName;
    try {
        const userId = await getUserId(targetUsername);
        if (!userId) { return res.status(404).send(`Jellyfin user '${targetUsername}' not found.`); }
        const searchUrl = `${jellyfinBaseUrl}/Users/${userId}/Items`;
        const response = await axios.get(searchUrl, {
            headers: { 'X-Emby-Token': apiKey },
            params: { SearchTerm: movieName, IncludeItemTypes: 'Movie', Recursive: true, }
        });
        const items = response.data.Items;
        if (items.length > 0) {
            const resultsHtml = items.map(item => {
                const movieTitle = `${item.Name} (${item.ProductionYear || 'N/A'})`;
                const jellyfinId = item.Id;
                return `
                    <div class="result-item">
                        <h3>${movieTitle}</h3>
                        <p><strong>JellyfinID:</strong> <code>${jellyfinId}</code></p>
                        <form action="/add-movie" method="POST" class="add-form">
                            <input type="hidden" name="movie" value="${movieTitle}">
                            <input type="hidden" name="jellyfinId" value="${jellyfinId}">
                            <label for="trigger-${jellyfinId}">Trigger Word:</label>
                            <input type="text" id="trigger-${jellyfinId}" name="trigger" required>
                            <button type="submit">Add to Database</button>
                        </form>
                    </div>
                `;
            }).join('<hr>');
            res.send(`
                <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Search Results</title>
                <style>
                    body { font-family: sans-serif; background-color: #f4f4f9; margin: 2rem; }
                    .container { max-width: 800px; margin: auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                    h2 { text-align: center; } .result-item { margin-bottom: 1rem; } .result-item h3 { margin-bottom: 0.5rem; }
                    .result-item p { margin-top: 0; background: #eee; padding: 10px; border-radius: 4px; }
                    .add-form label { font-weight: bold; margin-right: 10px; } .add-form input[type="text"] { padding: 8px; border-radius: 4px; border: 1px solid #ccc; }
                    .add-form button { background-color: #28a745; margin-left: 10px; color: white; } .add-form button:hover { background-color: #218838; }
                    a { display: inline-block; text-align: center; margin-top: 1rem; text-decoration: none; background-color: #6c757d; color: white; padding: 10px 15px; border-radius: 4px; }
                    a:hover { background-color: #5a6268; }
                </style></head><body><div class="container">
                <h2>Search Results for "${movieName}"</h2>
                ${resultsHtml}
                <a href="/">Cancel and Go Back</a>
                </div></body></html>
            `);
        } else {
            res.send(`<h2>No results found for "${movieName}".</h2><a href="/">Go back</a>`);
        }
    } catch (error) {
        console.error("Error communicating with Jellyfin API:", error.message);
        res.status(500).send("Error connecting to Jellyfin. Check server console for details.");
    }
});

// Album search route
app.post('/search-music', async (req, res) => {
    const albumName = req.body.albumName;
    try {
        const userId = await getUserId(targetUsername);
        if (!userId) { return res.status(404).send(`Jellyfin user '${targetUsername}' not found.`); }
        const searchUrl = `${jellyfinBaseUrl}/Users/${userId}/Items`;
        const response = await axios.get(searchUrl, {
            headers: { 'X-Emby-Token': apiKey },
            params: { SearchTerm: albumName, IncludeItemTypes: 'MusicAlbum', Recursive: true, }
        });
        const items = response.data.Items;
        if (items.length > 0) {
            const resultsHtml = items.map(item => {
                const albumTitle = `${item.Name} (${item.AlbumArtist || 'N/A'})`;
                const jellyfinId = item.Id;
                return `
                    <div class="result-item">
                        <h3>${albumTitle}</h3>
                        <p><strong>JellyfinID:</strong> <code>${jellyfinId}</code></p>
                        <form action="/add-album" method="POST" class="add-form">
                            <input type="hidden" name="album" value="${albumTitle}">
                            <input type="hidden" name="jellyfinId" value="${jellyfinId}">
                            <label for="trigger-${jellyfinId}">Trigger Word:</label>
                            <input type="text" id="trigger-${jellyfinId}" name="trigger" required>
                            <button type="submit">Add to Database</button>
                        </form>
                    </div>
                `;
            }).join('<hr>');
            res.send(`
                <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Search Results</title>
                <style>
                    body { font-family: sans-serif; background-color: #f4f4f9; margin: 2rem; }
                    .container { max-width: 800px; margin: auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                    h2 { text-align: center; } .result-item { margin-bottom: 1rem; } .result-item h3 { margin-bottom: 0.5rem; }
                    .result-item p { margin-top: 0; background: #eee; padding: 10px; border-radius: 4px; }
                    .add-form label { font-weight: bold; margin-right: 10px; } .add-form input[type="text"] { padding: 8px; border-radius: 4px; border: 1px solid #ccc; }
                    .add-form button { background-color: #28a745; margin-left: 10px; color: white; } .add-form button:hover { background-color: #218838; }
                    a { display: inline-block; text-align: center; margin-top: 1rem; text-decoration: none; background-color: #6c757d; color: white; padding: 10px 15px; border-radius: 4px; }
                    a:hover { background-color: #5a6268; }
                </style></head><body><div class="container">
                <h2>Search Results for "${albumName}"</h2>
                ${resultsHtml}
                <a href="/">Cancel and Go Back</a>
                </div></body></html>
            `);
        } else {
            res.send(`<h2>No results found for "${albumName}".</h2><a href="/">Go back</a>`);
        }
    } catch (error) {
        console.error("Error communicating with Jellyfin API:", error.message);
        res.status(500).send("Error connecting to Jellyfin. Check server console for details.");
    }
});

// Add movie route
app.post('/add-movie', (req, res) => {
    const { movie, jellyfinId, trigger } = req.body;
    if (!movie || !jellyfinId || !trigger) {
        return res.status(400).send("Missing data. Please try again.");
    }
    const insertStmt = db.prepare(`INSERT OR IGNORE INTO movies (movie, trigger_word, jellyfin_id) VALUES (?, ?, ?)`);
    try {
        const info = insertStmt.run(movie, trigger.toLowerCase(), jellyfinId);
        if (info.changes > 0) { console.log(`Successfully added "${movie}" to the database.`); } 
        else { console.log(`Movie with JellyfinID ${jellyfinId} or trigger ${trigger} already exists.`); }
    } catch (error) {
        console.error("Database insert error:", error.message);
        return res.status(500).send("Failed to add movie to the database.");
    }
    res.redirect('/');
});

// Add album route
app.post('/add-album', (req, res) => {
    const { album, jellyfinId, trigger } = req.body;
    if (!album || !jellyfinId || !trigger) {
        return res.status(400).send("Missing data. Please try again.");
    }
    const insertStmt = db.prepare(`INSERT OR IGNORE INTO albums (album, trigger_word, jellyfin_id) VALUES (?, ?, ?)`);
    try {
        const info = insertStmt.run(album, trigger.toLowerCase(), jellyfinId);
        if (info.changes > 0) { console.log(`Successfully added "${album}" to the database.`); } 
        else { console.log(`Album with JellyfinID ${jellyfinId} or trigger ${trigger} already exists.`); }
    } catch (error) {
        console.error("Database insert error:", error.message);
        return res.status(500).send("Failed to add album to the database.");
    }
    res.redirect('/');
});


// Session control routes handle types (movie/music)
app.post('/set-active-session', (req, res) => {
    const { sessionId, deviceName, client, type } = req.body;
    if (type === 'movie' || type === 'music') {
        activeSessions[type] = { id: sessionId, name: deviceName, client: client };
        saveSettings();
        console.log(`Active ${type.toUpperCase()} session set to: ${deviceName} (${sessionId})`);
    } else {
        console.error(`Invalid type received for setting active session: ${type}`);
    }
    res.redirect('/');
});

app.post('/clear-active-session/:type', (req, res) => {
    const { type } = req.params;
    if (type === 'movie' || type === 'music') {
        activeSessions[type] = null;
        saveSettings();
        console.log(`⚪ Active ${type.toUpperCase()} session cleared.`);
    } else {
        console.error(`Invalid type received for clearing active session: ${type}`);
    }
    res.redirect('/');
});


// Delete movie route
app.post('/delete-movie/:id', (req, res) => {
    const { id } = req.params;
    const deleteStmt = db.prepare('DELETE FROM movies WHERE id = ?');
    deleteStmt.run(id);
    res.redirect('/');
});

// Delete album route
app.post('/delete-album/:id', (req, res) => {
    const { id } = req.params;
    const deleteStmt = db.prepare('DELETE FROM albums WHERE id = ?');
    deleteStmt.run(id);
    res.redirect('/');
});

// THE TRIGGER ROUTE now uses the correct device based on media type
app.get('/:triggerWord', async (req, res) => {
    const triggerWord = req.params.triggerWord.toLowerCase();
    
    let item = null;
    let itemType = null;
    
    // Check for movie first
    const movieStmt = db.prepare('SELECT movie as name, jellyfin_id FROM movies WHERE trigger_word = ?');
    const movieResult = movieStmt.get(triggerWord);
    if (movieResult) {
        item = movieResult;
        itemType = 'movie';
    } else {
        // If no movie is found, check for an album
        const albumStmt = db.prepare('SELECT album as name, jellyfin_id FROM albums WHERE trigger_word = ?');
        const albumResult = albumStmt.get(triggerWord);
        if (albumResult) {
            item = albumResult;
            itemType = 'music';
        }
    }
    
    if (!item) {
        return res.status(404).send(`<h1>Playback Error</h1><p>No item found with the trigger word: <strong>${triggerWord}</strong></p>`);
    }

    const activeSessionForType = activeSessions[itemType];
    if (!activeSessionForType || !activeSessionForType.id) {
        return res.status(400).send(`<h1>Playback Error</h1><p>No active <strong>${itemType}</strong> device has been selected.</p><p>Please go to the <a href="/">main page</a>, click "View Sessions", and select a device for ${itemType} playback.</p>`);
    }

    try {
        const sessionId = activeSessionForType.id;
        const jellyfinId = item.jellyfin_id;
        const playUrl = `${jellyfinBaseUrl}/Sessions/${sessionId}/Playing`;
        console.log(`Sending play command for "${item.name}" (${itemType}) to device "${activeSessionForType.name}"`);
        
        await axios.post(
            playUrl,
            { playCommand: 'PlayNow', itemIds: [jellyfinId] },
            { headers: { 'X-Emby-Token': apiKey }, params: { PlayCommand: 'PlayNow', ItemIds: jellyfinId } }
        );

        res.send(`<!DOCTYPE html><html><head><title>Command Sent</title></head><body><p>Playback command sent. This window will now close.</p><script>window.close();</script></body></html>`);
    } catch (error) {
        console.error('Jellyfin playback command failed:', error?.response?.data || error?.message);
        res.status(500).send(`<h1>Playback Error</h1><p>Failed to send playback command. You can close this window.</p>`);
    }
});


// --- Server Start ---
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Triggers can be accessed on your network at http://<your-server-ip>:${port}/<trigger>`);
});