/* import a helper library */
// This keeps a list of all the ports that have connected to us
var apiPort;

function log(msg) {
  dump(new Date().toISOString() + ": [dssworker] " + msg + "\n");
  try {
    console.log(new Date().toISOString() + ": [dssworker] " + msg);
  } catch (e) {}
}

var _broadcastReceivers = [];
function broadcast(topic, payload)
{
  // we need to broadcast to all ports connected to this shared worker
  for (var i = 0; i < _broadcastReceivers.length; i++) {
    //log("about to broadcast to " + _broadcastReceivers[i] + "\n");
    _broadcastReceivers[i].postMessage({topic: topic, data: payload});
  }
}

// Called when the worker connects a message port
onconnect = function(e) {
  try {
    var port = e.ports[0];
    port.onmessage = function(e) {
      //log("worker onmessage: " + JSON.stringify(e.data));

      var msg = e.data;
      if (!msg) {
        log("onmessage called with no data");
        return;
      }
      // handle the special message that tells us a port is closing.
      if (msg.topic && msg.topic == "social.port-closing") {
        var index = _broadcastReceivers.indexOf(port);
        if (index != -1) {
          log("removed receiver " + index);
          _broadcastReceivers.splice(index, 1);
        }
        //log("bwmworker port closed - now " + _broadcastReceivers.length + " connections.");
        return;
      }

      if (msg.topic && handlers[msg.topic])
        handlers[msg.topic](port, msg);
      else {
        log("message topic not handled: "+msg.topic+" "+JSON.stringify(msg));
        // forward to the api
        try {
          apiPort.postMessage(msg);
        } catch(e) {
          log(e+"\n");
        }
      }
    };
    port.postMessage({topic: "worker.connected"});


  } catch (e) {
    log(e);
  }
}

var userData = {};
var eventSource = null;
var gContacts = {};
var gChats = {};
var gPendingChats = [];

function setUserData(aUserData) {
  // avoid recreating the event source if we already have one for
  // the correct user (ie when the sidebar is reopened / a second
  // window is opened.)
  if (aUserData && userData.userName == aUserData.userName)
    return;

  apiPort.postMessage({topic: "social.user-profile", data: aUserData});
  broadcast('social.user-profile', aUserData);

  if (!aUserData) {
    userData = {};
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    return;
  }

  userData = aUserData;

  eventSource = new EventSource("events?source=worker&sessionID=" + encodeURIComponent(userData.sessionID));

  // Hack to ensure the user is saved in the session immediately.
  var req = new XMLHttpRequest();
  req.open("get", "session?sessionID=" + encodeURIComponent(userData.sessionID), true);
  req.send();

  eventSource.addEventListener("userjoined", function(e) {
    if (e.data in gContacts) {
      return;
    }
    gContacts[e.data] = true;
    broadcast("userjoined", e.data);
  }, false);

  eventSource.addEventListener("userleft", function(e) {
    if (!gContacts[e.data]) {
      return;
    }
    delete gContacts[e.data];
    broadcast("userleft", e.data);
  }, false);

  eventSource.addEventListener("offer", function(e) {
    var data = JSON.parse(e.data);
    var from = data.from;

    // Silently drop calls from people already calling us.
    // The server won't cancel the ongoing call if there's a pending call.
    if (from in gChats) {
//      stopCall(from);
      return;
    }

    apiPort.postMessage({topic: "social.request-chat", data: "chatWindow.html"});
    gPendingChats.push(e.data);
    gChats[from] = true;
  }, false);
}

// Messages from the sidebar and chat windows:
var handlers = {
  'worker.connected': function(port, msg) {
    log("worker.connected");
  },
  'worker.reload': function(port, msg) {
    broadcast(msg.topic, msg.data);
    setUserData(null);
    apiPort.postMessage({topic: "social.user-profile", data: userData});
    broadcast('social.user-profile', userData);
    apiPort.postMessage({topic: 'social.reload-worker'});
  },
  'social.initialize': function(port, data) {
    //log("social.initialize called, capturing apiPort");
    apiPort = port;
    apiPort.postMessage({topic: 'social.cookies-get'})
  },
  'broadcast.listen': function(port, data) {
    if (data) {
      _broadcastReceivers.push(port);
      port.postMessage({topic: "social.user-profile", data: userData});
    }
    else {
      var i = _broadcastReceivers.indexOf(port);
      if (i != -1)
        _broadcastReceivers.splice(i, 1);
    }
  },
  'chat.listen': function(port, data) {
    var offerData = gPendingChats.shift();
    port.postMessage({topic: "offer", data: offerData});
    gChats[JSON.parse(offerData).from] = port;
  },

  'user.login': function(port, msg) {
    setUserData(JSON.parse(msg.data));
    broadcast('social.user-profile', userData);
  },
  'user.logout': function(port, msg) {
    setUserData(null);
  },

  'social.user-recommend-prompt': function(port, msg) {},
  'social.cookies-get-response': function(port, msg) {
    try {
      let cookies = msg.data;
      for (var i=0; i < cookies.length; i++) {
        if (cookies[i].name == "userdata") {
          setUserData(cookies[i].value ? JSON.parse(cookies[i].value) : null);
          break;
        }
      }
    } catch(e) {
      dump(e.stack+"\n");
    }
  }
}
