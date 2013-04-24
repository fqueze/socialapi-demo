var port = navigator.mozSocial.getWorker().port;

var gAudioOnly = false;

function onConnection(aWin, aPc, aPerson, aOriginator) {
}

function setupFileSharing(win, dc, target) {
}

var messageHandlers = {
  "worker.connected": function(data) {
    // our port has connected with the worker, do some initialization
    // worker.connected is our own custom message
    port.postMessage({topic: "chat.listen", data: true});
  },
  "offer": function(data) {
    data = JSON.parse(data);
    var from = data.from;
    var offer = JSON.parse(data.request);
    offer.sdp = offer.sdp.split("m=").filter(function(s) {
      return !s.startsWith("video") || s.indexOf("a=recvonly") == -1;
    }).join("m=");
    gAudioOnly = offer.sdp.indexOf("m=video") == -1;

    document.getElementById("callAnswer").style.display = "block";
    document.getElementById("reject").onclick = function() {
      window.close();
    };
    document.getElementById("accept").onclick = function() {
      document.getElementById("callAnswer").style.display = "none";
      var pc = webrtcMedia.handleOffer(data, window, gAudioOnly,
                                       onConnection, setupFileSharing);
      if (gAudioOnly) {
        document.getElementById("fullTab").style.display = "none";
        document.getElementById("video").style.display = "none";
        document.getElementById("chat").setAttribute("style", "top: 0; height: 246px;");
      }
    };
  }
};

port.onmessage = function onmessage(e) {
  var topic = e.data.topic;
  var data = e.data.data;
  if (messageHandlers[topic]) {
    messageHandlers[topic](data);
  }
};
