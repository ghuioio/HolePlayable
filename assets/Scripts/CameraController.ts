
import { _decorator, Component, Node, Vec3, Camera } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CameraController')
export class CameraController extends Component {

    @property({ type: Node })
    public followTarget: Node | null = null;

    @property
    public followStrength: number = 0.3;

    private _basePos: Vec3 = new Vec3();

    onLoad () {
        this._basePos = this.node.worldPosition.clone();
    }

    lateUpdate (dt: number) {
        if (!this.followTarget) return;

        const targetPos = this.followTarget.worldPosition;
        const offsetX = targetPos.x * this.followStrength;
        const offsetZ = targetPos.z * this.followStrength;

        const desiredPos = new Vec3(
            this._basePos.x + offsetX,
            this._basePos.y,
            this._basePos.z + offsetZ
        );

        const currentPos = this.node.worldPosition;
        const lerped = new Vec3();
        Vec3.lerp(lerped, currentPos, desiredPos, Math.min(1, dt * 4));
        this.node.setWorldPosition(lerped);
    }
}
