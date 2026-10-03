// The rig that brings img/makise.webp to life (see js/rig.js). Edit it in tools/rig.html.
Rig.add({
  "size": [866,1734],
  "maps": ["makise-rig-0.png","makise-rig-1.png","makise-rig-2.png"],
  "effects": [
    {"kind":"hold","name":"Body","mask":[0,0]},
    {"kind":"sway","name":"Hair","hold":true,"mask":[0,1],"gain":2.2,"wind":3.7,"hz":0.55,"damp":0.3,"max":13},
    {"kind":"wave","name":"Hair ripples","hold":true,"mask":[0,2],"amount":0.65,"length":250,"speed":67,"dir":90,"gust":2.25,"vary":1.4},
    {"kind":"swing","name":"Right arm","hold":true,"mask":[1,0],"gain":1.3,"wind":1.65,"hz":0.6,"damp":0.4,"max":5.8,"length":550,"pivot":[330,300]},
    {"kind":"swing","name":"Left arm","hold":true,"mask":[1,1],"gain":1.3,"wind":1.65,"hz":0.67,"damp":0.4,"max":5.8,"length":550,"pivot":[585,295]},
    {"kind":"wave","name":"Coat flutter","hold":true,"mask":[1,2],"amount":0.35,"length":270,"speed":56,"dir":62,"gust":3.5,"vary":0},
    {"kind":"breathe","name":"Breath","hold":false,"mask":[2,0],"amount":0.9,"dir":270,"period":4.8},
    {"kind":"parallax","name":"Head","hold":false,"mask":[2,1],"amount":3}
  ]
});
