
import {
    _decorator, Component, Node, Vec3, Prefab, instantiate,
    Collider, RigidBody
} from 'cc';
import { HoleController } from './HoleController';
import { WeaponItem } from './WeaponItem';
const { ccclass, property } = _decorator;

enum GamePhase {
    EATING = 0,
    BOSS_READY = 1,
}

@ccclass('GameManager')
export class GameManager extends Component {

    @property({ type: Prefab })
    public blockStaticPrefab: Prefab | null = null;

    @property({ type: Prefab })
    public blockDynamicPrefab: Prefab | null = null;

    @property({ type: HoleController })
    public holeController: HoleController | null = null;

    @property({ type: Node })
    public weaponContainer: Node | null = null;

    @property({ type: Node })
    public groundNode: Node | null = null;

    private static readonly GRID_W = 6;
    private static readonly GRID_H = 6;
    private static readonly GRID_D = 6;

    private static readonly ORIGIN_X = -2.5;
    private static readonly ORIGIN_Y = 0.5;
    private static readonly ORIGIN_Z = -2.5;

    private _phase: GamePhase = GamePhase.EATING;
    private _holeLevel: number = 1;
    private _weaponsEaten: number = 0;

    start() {
        this._patchGroundMask();
        this._wireHole();
        this._placeBlocks();
    }

    private _patchGroundMask() {
        const gNode = this.groundNode
            ?? this.node.scene?.getChildByName('Ground')
            ?? null;
        if (!gNode) {
            console.warn('GameManager: groundNode not found — dynamic blocks may fall through.');
            return;
        }
        const WEAPON_BIT = 1 << 2;
        const cols = gNode.getComponents(Collider);
        for (const col of cols) {
            col.setMask(col.getMask() | WEAPON_BIT);
        }
        const rb = gNode.getComponent(RigidBody);
        if (rb) rb.setMask(rb.getMask() | WEAPON_BIT);
    }

    private _wireHole() {
        if (!this.holeController) {
            console.warn('GameManager: holeController not assigned!');
            return;
        }
        this.holeController.onWeaponConsumed = (_size: number) => {
            this._onWeaponConsumed();
        };
    }

    private _placeBlocks() {
        if (!this.blockStaticPrefab || !this.blockDynamicPrefab) {
            console.warn('GameManager: blockStaticPrefab or blockDynamicPrefab not assigned!');
            return;
        }
        const container = this.weaponContainer || this.node;
        const { GRID_W, GRID_H, GRID_D, ORIGIN_X, ORIGIN_Y, ORIGIN_Z } = GameManager;

        for (let ix = 0; ix < GRID_W; ix++) {
            for (let iy = 0; iy < GRID_H; iy++) {
                for (let iz = 0; iz < GRID_D; iz++) {
                    const isGround = iy === 0;
                    const prefab = isGround ? this.blockStaticPrefab : this.blockDynamicPrefab;
                    const node = instantiate(prefab);
                    container.addChild(node);
                    node.setWorldPosition(
                        ORIGIN_X + ix,
                        ORIGIN_Y + iy,
                        ORIGIN_Z + iz
                    );
                }
            }
        }
    }

    private _onWeaponConsumed() {
        if (this._phase !== GamePhase.EATING) return;

        this._weaponsEaten++;
        if (this._weaponsEaten >= 5 && this._holeLevel < 3) {
            this._holeLevel++;
            this._weaponsEaten = 0;
            this.holeController?.upgrade(this._holeLevel);
        }
    }

    private _onBossPhase() {
        console.log('=== BOSS FIGHT PHASE TRIGGERED ===');
    }
}
