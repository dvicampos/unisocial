const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const session = require('express-session');
const app = express();

const { check, validationResult } = require('express-validator');
app.use(express.urlencoded({ extended: true }));

const multer = require('multer');
const storage = multer.memoryStorage(); // Almacena la imagen en la memoria
const upload = multer({ storage: storage });
app.use(upload.single('imagen'));


const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'blogdb'
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Conectado a MySQL');
});

app.use(session({
    secret: 'tu_clave_secreta',
    resave: true,
    saveUninitialized: true
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/login', [
    check('username').notEmpty().withMessage('Nombre de usuario es requerido'),
    check('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('login', { errors: errors.array() });
    }
    const username = req.body.username;
    const password = req.body.password;

    db.query('SELECT * FROM usuarios WHERE username = ?', [username], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            const user = results[0];
            bcrypt.compare(password, user.password, (error, isMatch) => {
                if (isMatch) {
                    req.session.user = user;
                    res.redirect('/todas_publicaciones');
                } else {
                    res.send('Contraseña incorrecta');
                }
            });
        } else {
            res.send('Usuario no encontrado');
        }
    });
});

app.get('/publicaciones', (req, res) => {
    if (req.session.user) {
        db.query('SELECT * FROM publicaciones', (err, results) => {
            if (err) throw err;
            res.render('publicaciones', { publicaciones: results });
        });
    } else {
        res.redirect('/');
    }
});


app.get('/mis_publicaciones', (req, res) => {
    if (req.session.user) {
        db.query('SELECT * FROM publicaciones WHERE usuario_id = ?', [req.session.user.id], (err, results) => {
            if (err) throw err;
            res.render('mis_publicaciones', { publicaciones: results });
        });
    } else {
        res.redirect('/');
    }
});

app.get('/nueva_publicacion', (req, res) => {
    if (req.session.user) {
        res.render('nueva_publicacion');
    } else {
        res.redirect('/');
    }
});

app.post('/nueva_publicacion', (req, res) => {
    if (req.session.user) {
        const { titulo, contenido } = req.body;
        const usuario_id = req.session.user.id;
        const imagen = req.file ? req.file.buffer : null;

        db.query('INSERT INTO publicaciones (titulo, contenido, usuario_id, imagen) VALUES (?, ?, ?, ?)',
            [titulo, contenido, usuario_id, imagen],
            (err, result) => {
                if (err) throw err;
                res.redirect('/mis_publicaciones');
            }
        );
    } else {
        res.redirect('/');
    }
});

app.get('/editar_publicacion/:id', (req, res) => {
    const publicacion_id = req.params.id;
    const usuario_id = req.session.user.id;

    db.query('SELECT * FROM publicaciones WHERE id = ? AND usuario_id = ?', [publicacion_id, usuario_id], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            const publicacion = results[0];
            res.render('editar_publicacion', { publicacion });
        } else {
            res.redirect('/mis_publicaciones');
        }
    });
});

app.post('/editar_publicacion/:id', (req, res) => {
    const publicacion_id = req.params.id;
    const { titulo, contenido, imagen_existente } = req.body;

    const nuevaImagen = req.file ? req.file.buffer : null;

    if (nuevaImagen) {
        db.query('UPDATE publicaciones SET titulo = ?, contenido = ?, imagen = ? WHERE id = ? AND usuario_id = ?',
            [titulo, contenido, nuevaImagen, publicacion_id, req.session.user.id],
            (err, result) => {
                if (err) throw err;
                res.redirect('/mis_publicaciones');
            }
        );
    } else {
        db.query('UPDATE publicaciones SET titulo = ?, contenido = ? WHERE id = ? AND usuario_id = ?',
            [titulo, contenido, publicacion_id, req.session.user.id],
            (err, result) => {
                if (err) throw err;
                res.redirect('/mis_publicaciones');
            }
        );
    }
});

app.get('/eliminar_publicacion/:id', (req, res) => {
    if (req.session.user) {
        const publicacionId = req.params.id;

        db.query('SELECT * FROM publicaciones WHERE id = ?', [publicacionId], (err, results) => {
            if (err) {
                return res.status(500).send('Error interno del servidor');
            }

            if (results.length === 0) {
                return res.status(404).send('Publicación no encontrada');
            }

            const publicacion = results[0];
            res.render('eliminar_publicacion', { publicacion });
        });
    } else {
        res.redirect('/');
    }
});

app.post('/eliminar_publicacion/:id', (req, res) => {
    if (req.session.user) {
        const publicacionId = req.params.id;

        db.query('DELETE FROM publicaciones WHERE id = ?', [publicacionId], (err, results) => {
            if (err) {
                return res.status(500).send('Error interno del servidor');
            }

            res.redirect('/mis_publicaciones'); 
        });
    } else {
        res.redirect('/');
    }
});



app.get('/registro', (req, res) => {
    res.render('registro');
});


app.post('/registro', [
    check('username').isLength({ min: 1 }).withMessage('Nombre de usuario es requerido'),
    check('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
] , (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('registro', { errors: errors.array() });
    }

    const { username, password } = req.body;

    db.query('SELECT * FROM usuarios WHERE username = ?', [username], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            res.send('El usuario ya existe. Por favor, elige otro nombre de usuario.');
        } else {
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) throw err;

                db.query('INSERT INTO usuarios (username, password) VALUES (?, ?)', [username, hash], (err, result) => {
                    if (err) throw err;
                    res.redirect('/');
                });
            });
        }
    });
});

app.get('/buscar_publicaciones', (req, res) => {
    if (req.session.user) {
        const searchTerm = req.query.q;

        db.query(
            'SELECT publicaciones.*, usuarios.username FROM publicaciones JOIN usuarios ON publicaciones.usuario_id = usuarios.id WHERE publicaciones.titulo LIKE ?',
            [`%${searchTerm}%`],
            (err, results) => {
                if (err) {
                    return res.status(500).send('Error interno del servidor');
                }

                res.render('resultados_busqueda', { searchTerm, publicaciones: results });
            }
        );
    } else {
        res.redirect('/');
    }
});


app.get('/todas_publicaciones', (req, res) => {
    // Utilizamos JOIN para obtener información de la tabla usuarios
    db.query('SELECT publicaciones.*, usuarios.username FROM publicaciones JOIN usuarios ON publicaciones.usuario_id = usuarios.id', (err, results) => {
        if (err) {
            return res.status(500).send('Error interno del servidor');
        }
        res.render('todas_publicaciones', { publicaciones: results });
    });
});


// EDITAR USUARIO 
app.get('/editar_perfil', (req, res) => {
    res.render('editar_perfil', { usuario: req.session.user });
});

app.post('/editar_perfil', (req, res) => {
    const { username, password } = req.body;

    db.query('UPDATE usuarios SET username = ?, password = ? WHERE id = ?',
        [username, password, req.session.user.id],
        (err, result) => {
            if (err) throw err;
            req.session.user.username = username;
            res.redirect('/');
        }
    );
});


app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error al cerrar sesión');
        }
        res.redirect('/');
    });
});


app.listen(3000, () => {
    console.log('Servidor en:http://localhost:3000/');
});
