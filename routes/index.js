module.exports = function (app, router) {
  app.use('/api', require('./home.js')(router));
  app.use('/api/users', require('./users'));
  app.use('/api/tasks', require('./tasks'));

  app.get('/api', (_req, res) => {
    res.json({ message: 'OK', data: { routes: ['users', 'tasks'] } });
  });
};