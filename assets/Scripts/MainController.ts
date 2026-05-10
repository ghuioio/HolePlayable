
import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('MainController')
export class MainController extends Component {

    start () {
        console.log('Hole Weapon — Playable Ad started!');
    }
}
