// The rig that brings img/makise.webp to life (see js/rig.js). Edit it in tools/rig.html.
Rig.add({
  "size": [866,1734],
  "maps": ["makise-rig-0.png","makise-rig-1.png","makise-rig-2.png"],
  "effects": [
    {"kind":"hold","name":"Body","mask":[0,0]},
    {"kind":"sway","name":"Hair","mask":[0,1],"gain":2.2,"wind":3.7,"hz":0.55,"damp":0.3,"max":13},
    {"kind":"wave","name":"Hair ripples","mask":[0,2],"amount":0.65,"length":250,"speed":67,"dir":90,"gust":2.25,"vary":1.4},
    {"kind":"swing","name":"Right arm","mask":[1,0],"pivot":[330,300],"length":550,"gain":1.3,"wind":1.65,"hz":0.6,"damp":0.4,"max":5.8},
    {"kind":"swing","name":"Left arm","mask":[1,1],"pivot":[585,295],"length":550,"gain":1.3,"wind":1.65,"hz":0.67,"damp":0.4,"max":5.8},
    {"kind":"wave","name":"Coat flutter","mask":[1,2],"amount":0.35,"length":270,"speed":56,"dir":62,"gust":3.5,"vary":0},
    {"kind":"breathe","name":"Breath","mask":[2,0],"amount":0.9,"dir":270,"period":4.8},
    {"kind":"parallax","name":"Head","mask":[2,1],"amount":3}
  ]
});
