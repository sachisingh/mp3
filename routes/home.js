module.exports = function (router) {
  const homeRoute = router.route('/');
  homeRoute.get(function (_req, res) {
    const hasUri = !!process.env.MONGODB_URI;
    res.json({ message: 'Service alive', data: { env: hasUri ? 'set' : 'missing' } });
  });
  return router;
};