try {
  require('./bot.js');
} catch (e) {
  console.log("CAUGHT ERROR:");
  console.log(e.stack);
}
