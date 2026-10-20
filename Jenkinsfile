
pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out MedVerify source code'
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
            }
        }

        stage('Build and Test') {
            steps {
                bat 'npm run build'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t jashk185/medverify:latest .'
            }
        }

        stage('Push Image to Docker Hub') {
            steps {
                
withCredentials([
    usernamePassword(
        credentialsId: 'dockerhub-creds',
        usernameVariable: 'DOCKER_USER',
        passwordVariable: 'DOCKER_PASS'
    )
]) {
    bat 'echo %DOCKER_PASS% | docker login -u %DOCKER_USER% --password-stdin'
    bat 'docker push jashk185/medverify:latest'
    bat 'docker logout'
}

            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                bat 'kubectl apply -f k8s/deployment.yaml'
                bat 'kubectl apply -f k8s/service.yaml'
                bat 'kubectl rollout status deployment/medverify'
            }
        }
    }
}
