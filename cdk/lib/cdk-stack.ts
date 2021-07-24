import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as s3 from '@aws-cdk/aws-s3';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as assets from '@aws-cdk/aws-s3-assets';
import * as route53 from '@aws-cdk/aws-route53';
import * as alias from '@aws-cdk/aws-route53-targets';
import * as path from 'path';

interface CdkStackProps extends cdk.StackProps {
    internalRecordName: string;
}

export class CdkStack extends cdk.Stack {
    private props: CdkStackProps;

    constructor(scope: cdk.Construct, id: string, props: CdkStackProps) {
        super(scope, id, props);
        this.props = props;

        const common = new Common(this, 'Common', {
            privateZoneName: this.props.internalRecordName
        });
        const appLayer = new AppLayer(this, 'AppLayer', {
            privateHostedZone: common.privateHostedZone,
            vpc: common.vpc,
            accessLogBucket: common.accessLogBucket,
        });
        const varnishLayer = new VarnishLayer(this, 'VarnishLayer', {
            vpc: common.vpc,
            accessLogBucket: common.accessLogBucket,
        });
    }
}

interface CommonProps {
    privateZoneName: string;
}

class Common extends cdk.Construct {
    private props: CommonProps;
    readonly vpc: ec2.Vpc;
    readonly privateHostedZone: route53.PrivateHostedZone;
    readonly accessLogBucket: s3.Bucket;

    constructor(scope: cdk.Construct, id: string, props: CommonProps) {
        super(scope, id);
        this.props = props;

        this.vpc = this.createVpc();
        this.privateHostedZone = this.createPrivateHostedZone();
        this.accessLogBucket = this.createAccessLogBucket();
    }

    /**
     * Creates VPC with all required resources, e.g. 
     * private & public subnets, route tables, etc.
     */
    createVpc() {
        return new ec2.Vpc(this, 'Vpc');
    }

    /**
     * This private zone will be use to create DNS record to mask
     * dynamic load balancer name.
     */
    createPrivateHostedZone() {
        return new route53.PrivateHostedZone(this, 'PrivateHostedZone', {
            zoneName: this.props.privateZoneName,
            vpc: this.vpc
        });
    }

    /**
     * Create bucket to log access on the Load balancer for debugging purpose
     */
    createAccessLogBucket() {
        return new s3.Bucket(this, 'AccessLogBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }
}

interface LayerProps {
    vpc: ec2.Vpc;
    accessLogBucket: s3.Bucket;
}

class Layer extends cdk.Construct {
    protected props: LayerProps;
    protected autoScalingGroup: autoscaling.AutoScalingGroup;
    protected loadBalancer: elbv2.ApplicationLoadBalancer;
    protected listener: elbv2.ApplicationListener;
    protected asset: assets.Asset;

    constructor(scope: cdk.Construct, id: string, props: LayerProps) {
        super(scope, id);
        this.props = props;
    }

    protected getDefaultLaunchInstanceType() {
        return ec2.InstanceType.of(
            ec2.InstanceClass.T2,
            ec2.InstanceSize.MICRO
        );
    }

    /**
     * This will upload asset to S3 bucket that will be downloaded
     * and installed by the instances on their launch.
     */
    createAsset(dirName: string) {
        this.asset = new assets.Asset(this, 'Asset', {
            path: path.join(__dirname, `../../${dirName}/`),
        });
    }

    createListener(): elbv2.ApplicationListener {
        const listener = this.loadBalancer.addListener('Listener', {
            port: 80,
        });
        listener.addTargets('Targets', {
            port: 80,
            targets: [
                this.autoScalingGroup
            ]
        });
        listener.connections.allowDefaultPortFromAnyIpv4()
        return listener;
    }

    /**
     * User Data will download assets uploaded and runs the script
     * install.sh
     */
    createBaseUserData(): ec2.UserData {
        const userData = ec2.UserData.forLinux();
        const dir = '/tmp/user-data/'
        userData.addS3DownloadCommand({
            bucket: this.asset.bucket,
            bucketKey: this.asset.s3ObjectKey,
            localFile: dir
        });
        userData.addCommands(`unzip ${dir}*.zip -d ${dir}`);
        userData.addExecuteFileCommand({
            filePath: `${dir}install.sh`
        });
        return userData;
    }

    output() {
        const concat = new cdk.StringConcat();
        new cdk.CfnOutput(this, 'LoadBalancerURL', { value: concat.join('http://', this.loadBalancer.loadBalancerDnsName) });
    }
}

interface AppLayerProps extends LayerProps {
    privateHostedZone: route53.PrivateHostedZone;
}

class AppLayer extends Layer {
    protected props: AppLayerProps;

    constructor(scope: cdk.Construct, id: string, props: AppLayerProps) {
        super(scope, id, props);
        this.createAsset('varnish');
        this.autoScalingGroup = this.createAutoScalingGroup();
        this.asset.bucket.grantRead(this.autoScalingGroup.role);
        this.loadBalancer = this.createLoadBalancer();
        this.listener = this.createListener();

        this.output();
    }

    createAutoScalingGroup(): autoscaling.AutoScalingGroup {
        const asg = new autoscaling.AutoScalingGroup(this, 'AutoScalingGroup', {
            vpc: this.props.vpc,
            instanceType: this.getDefaultLaunchInstanceType(),
            machineImage: new ec2.AmazonLinuxImage({
                userData: this.createBaseUserData(),
            }),
            minCapacity: 2,
            vpcSubnets: {
                subnets: this.props.vpc.privateSubnets,
            }
        });

        return asg;
    }

    createLoadBalancer(): elbv2.ApplicationLoadBalancer {
        const lb = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
            vpc: this.props.vpc,
            internetFacing: false,
            vpcSubnets: {
                subnets: this.props.vpc.privateSubnets,
            }
        });
        return lb;
    }

    /**
     * Creates DNS record to mask dynamic load balancer name.
     */
    createDnsRecord() {
        const targetAlias = new alias.LoadBalancerTarget(this.loadBalancer);
        new route53.ARecord(this, 'AliasRecord', {
            zone: this.props.privateHostedZone,
            recordName: 'app',
            target: route53.RecordTarget.fromAlias(targetAlias),
        });
    }
}

interface VarnishLayerProps extends LayerProps{
}

class VarnishLayer extends Layer {

    constructor(scope: cdk.Construct, id: string, props: VarnishLayerProps) {
        super(scope, id, props);
        this.createAsset('varnish');
        this.autoScalingGroup = this.createAutoScalingGroup();
        this.asset.bucket.grantRead(this.autoScalingGroup.role);
        this.loadBalancer = this.createLoadBalancer();
        this.listener = this.createListener();

        this.output();
    }

    createAutoScalingGroup(): autoscaling.AutoScalingGroup {
        const asg = new autoscaling.AutoScalingGroup(this, 'AutoScalingGroup', {
            vpc: this.props.vpc,
            instanceType: this.getDefaultLaunchInstanceType(),
            machineImage: new ec2.AmazonLinuxImage({
                userData: this.createBaseUserData(),
            }),
            minCapacity: 2,
            vpcSubnets: {
                subnets: this.props.vpc.publicSubnets,
            }
        });

        return asg;
    }

    createLoadBalancer(): elbv2.ApplicationLoadBalancer {
        const lb = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
            vpc: this.props.vpc,
            internetFacing: true
        });
        return lb;
    }

}
