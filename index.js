const express = require('express')
const app = express();
const multer = require('multer');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const { QuickDB } = require("quick.db");
const db = new QuickDB();
const users = require('./assets/json/users.json');

require('ejs');
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'hello',
    resave: true,
    saveUninitialized: true,
}));

app.use('/static', express.static('assets'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    e: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage,
    storageFilter: (req, file, callback) => {
        const supportedFileTypes = [
            'image/gif',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'video/mp4',
        ];
        if (!supportedFiletypes.includes(file.mimetype)) callback(null, false);
        callback(null, true);
    }
});

const validateCredentials = (username, password) => {
    return ((username.toLowerCase() === users[0].username && password === users[0].password) || (username.toLowerCase() === users[1].username && password === users[1].password));
}

app.get('/', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.redirect('/login');
    if (validateCredentials(user.username, user.password)) {
        const files = await db.all();
        console.log(files);
        const favorites = await db.get(`${user.username}.favorites`) || [];
        res.render('index', { user, files, favorites: favorites.map(f => f.id), pfp: users.find(u => u.username === user.username).pfp });
    } else {
        res.json({ error: 'Invalid credentials' });
    }
});

app.get("/editprofile", (req, res) => {
    const { user } = req.session;
    if (!user) return res.redirect('/login?returnUrl=editprofile');
    if (validateCredentials(user.username, user.password)) {
        res.render('editprofile', { user, pfp: users.find(u => u.username === user.username).pfp });
    } else {
        res.json({ error: 'Invalid credentials' });
    }
})

app.post("/editprofile", (req, res) => {
    const { user } = req.session;
    console.log(user);
    if (!user) return res.redirect('/login?returnUrl=editprofile');
    const { password, pfp } = req.body;
    if (password) {
        users.find(u => u.username === user.username).password = password;
        fs.writeFileSync('./assets/json/users.json', JSON.stringify(users, null, 2));
        res.json({ success: 'Profile updated' });
    };
    if (pfp) {
        users.find(u => u.username === user.username).pfp = pfp;
        fs.writeFileSync('./assets/json/users.json', JSON.stringify(users, null, 2));
        res.json({ success: 'Profile updated' });
    }
})

app.get('/upload', (req, res) => {
    const { user } = req.session;
    if (!user) return res.redirect('/login?returnUrl=upload');
    if (validateCredentials(user.username, user.password)) {
        res.render('upload', { user, pfp: users.find(u => u.username === user.username).pfp });
    } else {
        res.json({ error: 'Invalid credentials' });
    }
});

app.get('/favorites', async (req, res) => {
    const { user } = req.session;
    if (!user) return res.redirect('/login?returnUrl=favorites');
    if (validateCredentials(user.username, user.password)) {
        const favorites = await db.get(`${user.username}.favorites`) || [];
        const unique = [...new Set(favorites)]
        res.render('favorites', { user, files: unique, pfp: users.find(u => u.username === user.username).pfp});
    } else {
        res.json({ error: 'Invalid credentials' });
    }
});

app.post('/favorites/add', async (req, res) => {
    const { user } = req.session;
    const { id } = req.body;
    if (!user) return res.json({ error: 'You must be logged in to access this' });
    const file = await db.get(id);
    if (!file) return res.json({ error: 'Invalid file' });
    const userFavs = await db.get(`${user.username}.favorites`) || [];
    if (userFavs.map(f => f.id).includes(file.id)) {
        await db.delete(`${user.username}.favorites`, file);
        res.json({ existing: 'Removed from favorites' });
    } else {
        await db.push(`${user.username}.favorites`, file);
        res.json({ success: 'Added to favorites' });
    }
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { returnUrl: req.query.returnUrl });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    console.log(username, password);
    if (validateCredentials(username, password)) {
        req.session.user = {
            username,
            password
        };
        res.redirect(`/${req.query.returnUrl || ''}`);
    } else return res.json({ error: 'Invalid credentials' });
});

app.post('/upload', upload.single('img'), function (req, res, next) {
    try {
        if (req.body.password) {
            const { password } = req.body;
            const { path: f } = req.file;
            if (!f) return res.json({ error: 'Provide a file!' });
            const id = shortid.generate();
            const supportedFiletypes = [
                'image/gif',
                'image/jpeg',
                'image/jpg',
                'image/png',
            ];
            console.log(req.file.mimetype)
            if (!supportedFiletypes.includes(req.file.mimetype)) return res.json({
                error: "Couldn't upload file. Please try again with one of the correct filetypes: png, jpeg, jpg, .gif'"
            })
            const extension = path.extname(req.file.originalname);
            fs.rename(`./uploads/${req.file.path.slice(8)}`, `./uploads/${id}${extension}`, function (err) {
                console.log(err);
            });
            users.find(u => u.username === req.session.user.username).password = password;
            users.find(u => u.username === req.session.user.username).pfp = `/pfp/${id}${extension}`;
            fs.writeFileSync('./assets/json/users.json', JSON.stringify(users, null, 2));
            req.session.user.password = password;
            res.redirect('/');
        } else {
            const { path: f } = req.file;
            const { caption } = req.body;
            if (!f) return res.json({ error: 'Provide a file!' });
            const id = shortid.generate();
            const supportedFiletypes = [
                'image/gif',
                'image/jpeg',
                'image/jpg',
                'image/png',
                'video/mp4'
            ];
            console.log(req.file.mimetype)
            if (!supportedFiletypes.includes(req.file.mimetype)) return res.json({
                error: "Couldn't upload file. Please try again with one of the correct filetypes: png, jpeg, jpg, .mp4, .gif'"
            })
            const extension = path.extname(req.file.originalname);
            fs.rename(`./uploads/${req.file.path.slice(8)}`, `./uploads/${id.replace(/-/g, '')}${extension}`, function (err) {
                console.log(err);
            });
            db.set(id, {
                id,
                caption,
                extension,
                user: req.session.user.username
            });
            setTimeout(() => {
                res.redirect(`/`);
            }, 300)
        }
    } catch (e) {
        console.error(e)
        return res.json({
            error: "Couldn't upload file. Please try again with one of the correct filetypes: png, jpeg, jpg'"
        })
    }
});

app.get('/:id', async (req, res) => {
    const { id } = req.params;
    const data = await db.get(id.split(".")[0]);
    if (!data) return res.json({ error: 'Invalid File' });
    console.log(data);
    res.sendFile(process.cwd() + '/uploads/' + id)
});

app.get('/pfp/:id', async (req, res) => {
    const { id } = req.params;
    res.sendFile(process.cwd() + '/uploads/' + id)
})

app.get('/:id/delete', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { id } = req.params;
    const data = await db.get(id.split(".")[0]);
    if (!data) return res.json({ error: 'Invalid File' });
    if (data.user !== req.session.user.username) return res.json({ error: 'You do not have permission to delete this file' });
    await db.delete(id.split(".")[0]);
    fs.unlinkSync(`./uploads/${id}`);
    res.redirect('/');
})

app.listen(80, () => {
    console.log('http://localhost:80')
});