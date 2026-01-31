var BACKUP_KEYS = (function() {
    var sk = window.CourseConfigHelper ? function(s) { return window.CourseConfigHelper.storageKey(s); } : function(s) { return 'go-course-' + s; };
    var keys = [
        sk('progress'), sk('exercise-progress'), sk('srs'), sk('personal-notes'),
        sk('last-module'), sk('theme'), sk('focus-mode'), sk('timer-sound'),
        sk('sidebar'), sk('streaks'), sk('activity'), sk('session')
    ];
    // Add plugin backup keys
    var plugins = (window.CourseConfig && window.CourseConfig.plugins) || [];
    plugins.forEach(function(plugin) {
        if (plugin.backupKey) {
            keys.push(sk(plugin.backupKey));
        }
    });
    return keys;
})();

window.exportAllData = function () {
  var data = {};
  var keyCount = 0;

  BACKUP_KEYS.forEach(function (key) {
    var raw = localStorage.getItem(key);
    if (raw === null) return;
    keyCount++;
    try {
      data[key] = JSON.parse(raw);
    } catch (e) {
      data[key] = raw;
    }
  });

  if (keyCount === 0) {
    alert('No course data found to export.');
    return;
  }

  data._meta = {
    exportDate: new Date().toISOString(),
    version: 1,
    keys: keyCount
  };

  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = (window.CourseConfigHelper ? window.CourseConfigHelper.slug : 'go-course') + '-backup-' + date + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

window.importAllData = function (file) {
  var reader = new FileReader();

  reader.onload = function (e) {
    var data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      alert('Invalid backup file: could not parse JSON.');
      return;
    }

    if (!data._meta) {
      alert('Invalid backup file: missing metadata.');
      return;
    }

    if (!confirm('This will overwrite your current progress. Continue?')) {
      return;
    }

    var restored = 0;
    BACKUP_KEYS.forEach(function (key) {
      if (!(key in data)) return;
      var val = data[key];
      if (typeof val === 'string') {
        localStorage.setItem(key, val);
      } else {
        localStorage.setItem(key, JSON.stringify(val));
      }
      restored++;
    });

    alert('Restore complete: ' + restored + ' key(s) restored.');
    location.reload();
  };

  reader.readAsText(file);
};

window.nukeEverything = function () {
  if (!confirm('This will permanently delete ALL course data, localStorage, and service worker caches. There is no undo. Continue?')) {
    return;
  }
  if (!confirm('Are you really sure? Export your data first if you want to keep it.')) {
    return;
  }

  // Clear all known keys
  BACKUP_KEYS.forEach(function (key) {
    localStorage.removeItem(key);
  });

  // Also nuke any course key we might have missed
  var storagePrefix = window.CourseConfigHelper ? window.CourseConfigHelper.storagePrefix : 'go-course';
  var toRemove = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf(storagePrefix) === 0) {
      toRemove.push(k);
    }
  }
  toRemove.forEach(function (k) {
    localStorage.removeItem(k);
  });

  // Unregister service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach(function (reg) {
        reg.unregister();
      });
    });
  }

  // Delete all caches
  if ('caches' in window) {
    caches.keys().then(function (names) {
      names.forEach(function (name) {
        caches.delete(name);
      });
    });
  }

  alert('Everything nuked. Page will reload.');
  location.reload();
};
